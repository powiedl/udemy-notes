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
  // Type Assertion 'as z.infer' ist nötig, damit TS das leere Objekt als Default für beliebige Schemas akzeptiert
  return combined.optional().default({} as z.infer<typeof combined>)
}
```

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

Im .handler holt man sich den context und data aus den Parameter und verwendet sie dannn innerhalb der `wrapServerAction` (wobei man dieser weder `data` noch `context` als Parameter übergeben muss, damit sie Zugriff darauf hat - weil sie "innerhalb" der Handlerfunktion definiert wird und damit automatisch Zugriff auf alles hat, worauf die handler Funktion selbst Zugriff hat)

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

Da die Server Function innerhalb der Komponente aufgerufen wird, und nicht im Loader, sollte man den Hook `useServerFn` verwenden (auch wenn es gut möglich ist, dass ein direkter Aufruf der Server Function auch funktioniert). Der Hook ist insbesondere bei komplexeren Datentypen die zwischen Client und Server geschickt werden müssen robuster. Außerdem erhöht er automatisch die Sicherheit, weil er beispielsweise CSRF Checks und Automatische Header hinzufügt. Man sollte sich daher angewöhnen innerhalb einer Komponente immer den Hook zu verwenden und nur außerhalb (beispielsweise im loader die Server Function direkt aufzurufen).

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
