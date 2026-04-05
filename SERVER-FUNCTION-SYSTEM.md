# Server Function System

Im folgenden wird das vollständige einheitliche Server Function System beschrieben, dass ich in diesem Projekt verwendet habe.

# Dokumentation: Einheitliches Server-Function-System (UdNo)

Dieses System stellt sicher, dass alle Server Functions eine einheitliche Rückgabestruktur besitzen, Fehler automatisch in die Datenbank geloggt werden und optional Metadaten (wie die aufrufende Frontend-Komponente) übergeben werden können.

---

## Das Datenmodell (Prisma)

**Datei:** `prisma/schema.prisma`

Das Log-Modell speichert Fehler zentral in der PostgreSQL/Neon Datenbank. Wir trennen `serverFunction` (Name der Logik) und `component` (Ort im UI), um bei Fehlern auf Vercel sofort zu sehen, welcher User-Flow betroffen war. Wenn im weiteren Verlauf des Projekts zusätzliche Felder im Log in der Datenbank aufscheinen sollen, muss diese zuerst hier hinzufügen.

```prisma
model Log {
  id             String   @id @default(uuid())
  component      String?  // Name der Frontend-Komponente (optional beim Aufruf)
  serverFunction String?  // Name der Server Function (automatisch durch Wrapper)
  severity       String?  // 'info' | 'warning' | 'error' | 'critical'
  message        String?  // Die Fehlermeldung

  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  @@map("log")
}
```

## Der einheitliche Rückgabetyp

**Datei:** `src/types/api.ts`

Anstatt Rohdaten zurückzugeben, nutzen wir diesen Union-Type. Er zwingt das Frontend dazu, den success-Status zu prüfen, bevor auf data zugegriffen werden kann, was Laufzeitfehler minimiert.

```typeScript
export type UdNoServerResponse<T> =
  | { success: true; data: T; message?: string }
  | {
      success: false;
      error: string;
      code?: string;
      component?: string;
      serverFunction?: string
    };
```

## Zentrale Validierungs-Hilfe (Zod)

**Datei:** `src/schemas/api-utils.ts`

Diese Hilfsfunktion erweitert jedes Zod-Schema um loggingMetadata. Der Trick mit `.optional().default({})` erlaubt es, die Server Function ohne Argumente aufzurufen (z.B. `getCoursesFn()`), ohne dass Zod wegen eines fehlenden Objekts abbricht.

```typescript
import { z } from 'zod'

export const loggingMetadataSchema = z.object({
  loggingMetadata: z
    .object({
      component: z.string().optional(),
    })
    .optional(),
})

export function withLogging<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const combined = schema.and(loggingMetadataSchema)
  // Wenn der Input fehlt (undefined), füttern wir das Schema mit einem leeren Objekt,
  // damit die internen Defaults berechnet werden.
  return z.preprocess((val) => val ?? {}, combined)
}
```

Das return in `withLogging` sorgt dafür, dass das Schema ein leeres Objekt bekommt, falls der input undefined ist. Damit ist es möglich, dass .default() im jeweiligen `.inputValidator` berücksichtigt werden - andernfalls "verschluckt" die withLogging die direkt im `.inputValidator()` angegebenen .defaults, wenn ein leeres Objekt an das Schema übergeben wird.

## Der Server-Action Wrapper (Logic & Logging)

**Datei:** `src/lib/server-utils.ts`

Der Wrapper führt die Datenbank-Logik aus. Tritt ein Fehler auf (z.B. Prisma-Timeout oder Validierungsfehler), wird dieser via `logToDb` gespeichert und eine strukturierte Fehlermeldung zurückgegeben.

```typescript
import { logToDb } from './logging'
import { UdNoServerResponse } from '../types/api'

export async function wrapServerAction<T>(
  serverFunctionName: string,
  fn: () => Promise<T>,
  clientComponent?: string,
): Promise<UdNoServerResponse<T>> {
  try {
    const data = await fn()
    return { success: true, data }
  } catch (error: any) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unbekannter Fehler'

    // Automatisches Logging in die Datenbank
    await logToDb({
      serverFunction: serverFunctionName,
      component: clientComponent,
      severity: 'error',
      message: errorMessage,
    })

    return {
      success: false,
      error: errorMessage,
      serverFunction: serverFunctionName,
      component: clientComponent,
    }
  }
}
```

## Implementierung einer Server Function

**Datei:** `src/data/course.ts (Beispiel)`

Das Chaining von TanStack Start bleibt erhalten. Die Middleware liefert den context, der Validator sorgt für saubere data, und der Wrapper kümmert sich um das Result-Objekt.

Diese Server Function erwartet kein Objekt als Parameter - das legen wir im `.inputValidator` mit `z.object({})` fest.

```typescript
export const getCoursesFn = createServerFn({ method: 'GET' })
  .middleware([authFnMiddleware])
  .inputValidator((d: unknown) => withLogging(z.object({})).parse(d))
  .handler(async ({ data, context }) => {
    // 2. Achte auf die Reihenfolge der Argumente in wrapServerAction:
    // (serverFunctionName, fn, clientComponent)
    return await wrapServerAction(
      'getCoursesFn',
      async () => {
        await sleep(10)
        // WICHTIG: await vor prisma!
        const courses = await prisma.course.findMany({
          where: {
            userId: context.session.user.id,
          },
          orderBy: {
            updatedAt: 'desc',
          },
          include: { _count: { select: { notes: true } } },
        })
        return courses
      },
      // 3. Zugriff auf die Komponente über loggingMetadata
      data.loggingMetadata?.component,
    )
  })
```

### eine Server Function die auch einen Parameter erwartet

**Datei:** `src/data/course.ts`

```typescript
export const getCourseById = createServerFn({ method: 'GET' })
  .middleware([authFnMiddleware])
  .inputValidator((d: unknown) =>
    withLogging(z.object({ id: z.string() })).parse(d),
  )
  .handler(async ({ context, data }) => {
    return await wrapServerAction(
      'getCourseById',
      async () => {
        const userId = context.session.user.id
        const { id } = data
        const course = await prisma.course.findUnique({
          where: {
            userId,
            id,
          },

          include: { notes: { orderBy: { orderInfo: 'desc' } } },
        })
        if (!course) throw notFound()
        return course
      },
      data.loggingMetadata?.component,
    )
  })
```

**WICHTIG:** In der `.handler` Methode darf außer dem return await wrapServerAction(...)`kein anderer Code stehen, sonst wird das return der wrapServerAction "verschluckt". Wahrscheinlich kann man das Ergebnis in einer Variablen speichern und am Ende selbst die Variabe zurückliefern (dann darf man auch zusätzlichen Code in der`.handler` Methode stehen haben).

## Verwendung im Frontend (Client) - für eine Server Function, die keinen Parameter erwartet

**Datei:** `src/components/CoursesList.tsx`

Zuerst muss die Route definiert werden. Dabei wird als Loader eine Funktion definiert, die sofort ein Promise zurückgibt. Weil wir ein Suspense verwenden, ist es wichtig, dass die Funktion sofort etwas zurückgibt. Weil das, was sie zurückgibt ein Promise ist, wird zuerst der fallback des Suspense gerendert (siehe weiter unten).

```typescript
export const Route = createFileRoute('/_content/courses/')({
  component: RouteComponent,
  loader: () => ({ coursesPromise: getCoursesFn({}) }),
  head: () => ({
    meta: [
      {
        title: 'Courses | Udemy Notes',
      },
    ],
  }),
})
```

### Routekomponente

Da wir während des Ladens der Daten im Frontend eine Loader-Animation sehen wollen, können wir die eigentliche Komponente, nicht direkt in die `RouteComponent` geben, sondern müssen eine zusätzliche (lokale) Komponente verwenden. In der `RouteKomponente` befindet sich das`Suspense` mit dem `fallback` (eben dem `Loader`)`

```typescript
function RouteComponent() {
  const { coursesPromise } = Route.useLoaderData()

  return (
    <Suspense fallback={<Loader2 className="size-40 animate-spin" />}>
      <CoursesList data={coursesPromise} />
    </Suspense>
  )
}
```

### Die eigentliche Komponente im Suspense

Diese Komponente wird gerendert, wenn das Promise aufgelöst wird. Im Frontend nutzen wir die "Guard Clause", um Fehler abzufangen. TypeScript erkennt danach automatisch, dass `result.data` das korrekte Datenformat (hier das Kurs-Array) besitzt.

```typescript
function CoursesList({ data }: { data: ReturnType<typeof getCoursesFn> }) {
  const result = use(data)
  if (!result.success)
    return (
      <div className="p-4 border border-red-500 bg-red-50 text-red-700 rounded">
        <p>Error while loading the courses ...</p>
        <pre>{result.error}</pre>
      </div>
    )
  const courses = result.data
  if (!courses)
    return (
      <Empty className="border rounded-lg h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BookOpenText className="size-12" />
          </EmptyMedia>
          <EmptyTitle>No courses imported yet</EmptyTitle>
        </EmptyHeader>
        <EmptyDescription>
          Import a course to start working with your notes
        </EmptyDescription>
        <EmptyContent>
          <Link className={cn(buttonVariants(), 'gap-2')} to="/courses/import">
            <UploadCloud className="size-4" />
            Import Course
          </Link>
        </EmptyContent>
      </Empty>
    )
  return (
    <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
      {courses.map((course) => (
        <CourseHeader
          course={course}
          singleCourse={false}
          key={course.id}
          onExport={() => handleExportCourse(course.id)}
          onDelete={() => handleDeleteCourse(course.id)}
        />
      ))}
    </div>
  )
}
```

### Die eigentliche Komponente verwendet useEffect (der die "aufgelösten" Daten benötigt)

Damit steht man vor einem "Dilemma". Einerseits darf ein useEffect nicht nach einer Bedingung kommen (`if (!result.success) return <p>FEHLER</p>`), andererseits braucht der `useEffect` aber die Sicherheit, dass `result.success` true ist. Die Lösung ist relativ einfach: eine Unterkomponente.

```typescript
function Course({ data }: { data: ReturnType<typeof getCourseById> }) {
  const result = use(data)
  // useEffect(() => {
  //   document.title = course.title || 'Course Details'
  // }, [course.title])
  if (!result.success)
    return (
      <div className="p-4 border border-red-500 bg-red-50 text-red-700 rounded">
        <p>Error while loading the course</p>
        <pre>{result.error}</pre>
      </div>
    )
  const course = result.data
  return <CourseContent course={course} />
}

function CourseContent({ course }: { course: any }) {
  useEffect(() => {
    document.title = course.title
  }, [course.title])

  return (
    <Card>
      <CardHeader>
        <CourseHeader
          course={course}
          onExport={() => handleExportCourse(course.id)}
          onDelete={() => handleDeleteCourse(course.id)}
        />
      </CardHeader>
      <CardContent>
        <NotesList notes={course.notes} />
      </CardContent>
    </Card>
  )
}
```

**Hinweis:** In diesem Beispiel ist es nicht notwendig einen useEffect zu verwenden. TanStack Start basiert auf React 19. In React 19 kann man für meta Daten einfach an irgendeiner Stelle in der Komponente ein entsprechendes Tag verwenden. React 19 erkennt, dass es ein Element ist, dass in den head Bereich gehört und verschiebt es automatisch in den head Bereich, d. h. den Titel können wir einfach nach `if (!result.success) return <p>FEHLER</p>` mit `<title>{result.data.title}</title>` setzen.

## Verwendung im 'Frontend (Client)' - für eine Server Function, die Parameter erwartet

Für eine Server Function, die Parameter erwartet ist es ähnlich - aber wir müssen natürlich den Parameter übergeben. Dadurch, dass ein paar Funktionen hintereinander die Parameter auswerten, "verändern" und weitergeben, kann es etwas verwirrend sein, was genau man übergeben muss.

Die Server Function erwartet immer ein Objekt als einzigen Parameter (wenn man keinen Parameter benötigt, übergibt man ein leeres Objekt). Andernfalls muss in dem Objekt ein Attribut `data` existieren, dass wieder ein Objekt ist. Dieses Objekt sind die eigentlichen Nutzdaten, d. h. wenn man "am Ende" einen Parameter id vom Typ string will, ruft man die entsprechende Server Function so auf `deleteCourseById({data:{id:'meine-kurs-id'}})`.

In der Server Function im inputValidator validiert man die Parameter dann so (also innerhalb von `withLogging`, dafür dann dort nur den Inhalt von `data`):

```typescript
  .inputValidator((d: unknown) =>
    withLogging(z.object({ id: z.string() })).parse(d),
  )
```

Im `.handler` holt man sich den context und data aus dem Parameter und verwendet sie dannn innerhalb der `wrapServerAction` (wobei man dieser weder `data` noch `context` als Parameter übergeben muss, damit sie Zugriff darauf hat - weil sie "innerhalb" der Handlerfunktion definiert wird und damit automatisch Zugriff auf alles hat, worauf die handler Funktion selbst Zugriff hat)

```typescript
  .handler(async ({ context, data }) => {
    return await wrapServerAction(
      'deleteCourseById',
      async () => {
        const userId = context.session.user.id
        const { id } = data
```

## Wenn die Server Function FormData bekommt

Wenn eine Server Function FormData verarbeiten muss, können wir den bisherigen Weg nicht nehmen, weil FormData mit dem JSON-basierten Logging-System kollidiert (FormData ist ein flaches Schlüssel-Wert-System, aber `withLogging` erwartet ein verschachteltes JSON-Objekt).

Daher muss man die loggingMetadata als zusätzliches String oder JSON-Feld in das FormData packen, bevor wir es vom Client abschicken. Im inputValidator extrahieren wir dann beides manuell. Hier das Beispiel mit der `importHtmlFile` Server Function:

### Die adaptierte ServerFunction

```typescript
export const importHtmlFile = createServerFn({ method: 'POST' })
  .middleware([authFnMiddleware])
  .inputValidator(async (data: unknown) => {
    // 1. Grundprüfung auf FormData
    if (!(data instanceof FormData)) {
      throw new Error('Expected FormData')
    }

    // 2. Datei extrahieren & validieren (wie bisher)
    const file = data.get('file') as File
    if (!file || file.type !== 'text/html') {
      throw new Error('Only HTML files are allowed.')
    }
    if (file.size > MAX_FILE_SIZE_UPLOAD) {
      throw new Error('File too large.')
    }

    // 3. NEU: loggingMetadata aus FormData extrahieren
    // Wir schicken es vom Client als JSON-String im Feld 'loggingMetadata'
    const rawLogging = data.get('loggingMetadata')
    let loggingMetadata

    if (rawLogging && typeof rawLogging === 'string') {
      try {
        loggingMetadata = JSON.parse(rawLogging)
      } catch (e) {
        // Falls JSON-Parse fehlschlägt, ignorieren wir es oder setzen Default
      }
    }

    // Wir geben die Struktur zurück, die unser Handler erwartet
    return {
      file,
      loggingMetadata, // Damit data.loggingMetadata im Handler existiert
    }
  })
  .handler(async ({ data, context }) => {
```

### Und der Client Teil (wobei hier dazu kommt, dass die Server Function nicht im Loader sondern innerhalb der Komponente aufgerufen wird)

Da die Server Function innerhalb der Komponente aufgerufen wird, und nicht im Loader, "muss" man den Hook `useServerFn` verwenden (auch wenn es möglich ist, dass ein direkter Aufruf der Server Function auch funktioniert - bei deleteCourse war es so, bei exportCourse aber nicht - ich habe daher alles auf den Hook umgestellt - es ist auch "richtig"). Der Hook ist insbesondere bei komplexeren Datentypen, die zwischen Client und Server geschickt werden müssen, robuster. Außerdem erhöht er automatisch die Sicherheit, weil er beispielsweise CSRF Checks und Automatische Header hinzufügt. Man sollte sich daher angewöhnen innerhalb einer Komponente immer den Hook zu verwenden und nur außerhalb (beispielsweise im loader die Server Function direkt aufzurufen).

```typescript
export function ImportHtmlForm() {
  const navigate = useNavigate()
  const [isPending, startTransition] = useTransition()
  const uploadFile = useServerFn(importHtmlFile)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const form = useForm({
    defaultValues: {
      file: null as unknown as File,
    },
    validators: {
      onChange: importHtmlFileSchema, // Validierung bei jeder Änderung
    },
    onSubmit: async ({ value }: { value: { file: File } }) => {
      if (!value.file) {
        toast.error('Please select a file first')
        return
      }

      const formData = new FormData()
      formData.append('file', value.file)

      // Korrektur: 'loggingMetadata' statt 'loggingMetdata'
      formData.append(
        'loggingMetadata',
        JSON.stringify({ component: 'ImportHtmlForm' }),
      )

      startTransition(async () => {
        try {
          const result = await uploadFile({ data: formData })

          if (!result.success) {
            toast.error(result.error)
            return
          }

          toast.success('Course notes processed successfully')

          // Navigation zur Detailseite des neuen Kurses
          await navigate({
            to: '/courses/$courseId', // Pfad an deine Route anpassen
            params: { courseId: result.data.courseId },
          })
        } catch (error) {
          console.error('Submit Error:', error)
          toast.error('An unexpected error occurred during upload')
        }
      })
    },
  })

  return (
    <Card className="max-w-md w-full mx-auto">
      <CardHeader>
        ...
```

Im `onSubmit` wird ziemlich am Anfang das formData um die loggingMetaData angereichert, damit alles gemeinsam zum Server geschickt wird (wie wir im Server die Daten entgegennehmen und wieder zerteilen haben wir im Abschnitt davor schon gesehen).

## Wenn man die Client Logik in unterschiedlichen Komponenten verwenden will (aber nur einmal zentral festlegen möchte)

Mein erster Ansatz war die entsprechenden handler in einer zentralen Datei zu schreiben und diese handler dann in den jeweiligen Komponenten zu importieren (bzw. in Parent Komponenten zu importieren und sie mittels Prop Passing weiterzureichen).

Das **Problem bei dem Ansatz:** Die Eventhandler sind dann nicht mehr innerhalb einer Komponente und dürfen daher keinen Hook verwenden - wir müssen aber den useServerFn Hook verwenden.

Die **Lösung:** Wir schreiben einen custom Hook, der den Eventhandlercode enthält. In diesem dürfen wir useServerFn verwenden - womit wir die richtig gekapselte Server Function im Eventhandler zur Verfügung haben.

Hier das Beispiel für den deleteCourse und den exportCourse custom Handler:

### Der custom Hook zum "Kapseln" der Server Function

Datei: \*\*src/hooks/use-course-actions.ts

```typescript
import { useServerFn } from '@tanstack/react-start'
import { exportMdFile } from '#/data/import-export'
import { toast } from 'sonner'
import { deleteCourseById } from '#/data/course'

export function useCourseActions() {
  // Wir sagen dem Hook explizit, welches Schema die Funktion hat
  const exportFn = useServerFn<typeof exportMdFile>(exportMdFile)
  const deleteFn = useServerFn<typeof deleteCourseById>(deleteCourseById)

  const handleDelete = async (id: string) => {
    const result = await deleteFn({
      data: {
        id: id,
        loggingMetadata: {
          component: 'CourseHeader, customHook handleDelete',
        },
      },
    })
    return result
  }
  const handleExport = async (courseId: string) => {
    const toastId = toast.loading('Markdown wird generiert...')

    try {
      // Hier rufen wir die Funktion auf.
      // WICHTIG: Das 'await' stellt sicher, dass result den Rückgabetyp der Server Fn hat
      const result = await exportFn({
        data: {
          courseId,
          includeNotesMetadata: true,
          includeTags: true,
          includeOriginalNote: true,
          loggingMetadata: {
            component: 'CourseHeader, customHook handleExport',
          },
        },
      })

      if (!result) {
        throw new Error('Server lieferte keine Antwort')
      }

      if (!result.success) {
        // Hier greift dein Error-Logging-System
        throw new Error(result.error)
      }

      // ERFOLGSFALL: result.data.markdown ist jetzt sicher verfügbar
      const markdownContent = result.data.markdown

      const blob = new Blob([markdownContent], { type: 'text/markdown' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `course-${courseId}.md`
      document.body.appendChild(link)
      link.click()

      // Cleanup
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      toast.success('Download gestartet!', { id: toastId })
    } catch (e: any) {
      console.error('Export Error:', e)
      toast.error(e.message || 'Export fehlgeschlagen', { id: toastId })
    }
  }

  return { handleExport, handleDelete }
}
```

**Wichtig:** Wir müssen den Type für die beiden Server Functions bei `useServerFn` richtig mitgeben (sonst kommt TanStack Start/Typescript durcheinander und liefert an unterschiedlichsten Stellen falsche Type Errors).

### Die Parent Komponente, die den Eventhandler vom Custom Hook holt und an die Child Komponente weitergibt

**Datei:** `src/routes/_content/$courseId.index.tsx` (oder `src/routes/_content/.index.tsx`)

```typescript
function CoursesList({ data }: { data: ReturnType<typeof getCoursesFn> }) {
  const result = use(data)
  const { handleExport, handleDelete } = useCourseActions()
  if (!result.success)
    return (
      <div className="p-4 border border-red-500 bg-red-50 text-red-700 rounded">
        <p>Error while loading the courses ...</p>
        <pre>{result.error}</pre>
      </div>
    )
  const courses = result.data
  if (!courses)
    return (
      <Empty className="border rounded-lg h-full">
        ...
      </Empty>
    )
  return (
    <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
      {courses.map((course) => (
        <CourseHeader
          course={course}
          singleCourse={false}
          key={course.id}
          onExport={() => handleExport(course.id)}
          onDelete={() => handleDelete(course.id)}
        />
      ))}
    </div>
  )
}
```

### Die Child Komponente, die den Handler als Prop entgegen nimmt

**Datei:** `src/components/web/course-header.tsx`

```typescript
const CourseHeader = <T,>({
  course,
  singleCourse = true,
  onExport,
  onDelete,
}: {
  course: Course
  singleCourse?: boolean
  onExport: (id: string) => void
  onDelete: (id: string) => Promise<UdNoServerResponse<T>>
}) => {
  const [isDeleting, startTransition] = useTransition()
  const router = useRouter()
  const navigate = useNavigate()
  const countNotes =
    'notes' in course
      ? course.notes && course.notes.length
      : (course._count && course._count.notes) || 0
  const handleDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    startTransition(async () => {
      try {
        const result = await onDelete(course.id)
        if (!result.success) throw new Error(result.error)
        if (typeof result.data === 'string') {
          toast.success(result.data)
        } else {
          toast.success('Course deleted successfully')
        }
        if (singleCourse) {
          await navigate({ to: '/courses', replace: true })
        } else {
          await router.invalidate()
        }
      } catch (error) {
        //console.log(error)
        if (typeof error === 'string') {
          toast.error(error)
        } else {
          toast.error(
            'Something unexptected happened while trying to delete the course',
          )
        }
      }
    })
  }
  return (
    <Card
      key={course.id}
      className="group overflow-hidden transition-all hover:shadow-lg px-4 py-2"
    >
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          {!singleCourse ? (
            <Link
              to="/courses/$courseId"
              params={{ courseId: course.id }}
              className="block line-clamp-3"
            >
              {course.title}
            </Link>
          ) : (
            <h1 className="text-4xl  font-semibold">{course.title}</h1>
          )}
        </CardTitle>
        <CardContent className="flex flex-col">
          <div>Tags</div>
          <div>
            {countNotes} note{countNotes === 1 ? '' : 's'}
          </div>
        </CardContent>
        <CardFooter className="flex flex-row gap-4">
          <Button
            type="button"
            onClick={() => {
              onExport(course.id)
            }}
          >
            <Download className="size-4 mr-1" />
            <span
              className={cn('hidden', singleCourse ? 'sm:inline' : 'md:inline')}
            >
              Export
            </span>
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2
                className={cn(
                  'size-4 hidden animate-spin mr-1',
                  isDeleting ? 'inline' : '',
                )}
              />
            ) : (
              <Delete className="size-4 mr-1" />
            )}
            <span
              className={cn('hidden', singleCourse ? 'sm:inline' : 'md:inline')}
            >
              {isDeleting ? 'Deleting' : 'Delete'}
            </span>
          </Button>
        </CardFooter>
      </CardHeader>
    </Card>
  )
}
```
