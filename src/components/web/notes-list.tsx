import { Fragment } from 'react'
import type { ExtractData, ServerFnData } from '#/types/api'
import Note from './note'
import CourseHeader from '#/components/web/course-header'
import type {
  AwaitedReturnTypeGetNotes,
  getNotesForCourseFn,
} from '#/data/note'
// import { CourseHeaderData } from '#/data/course'

type GlobalNote = ExtractData<AwaitedReturnTypeGetNotes>['items'][number]
type CourseNote = ServerFnData<typeof getNotesForCourseFn>['items'][number]
// type FlexibleNote = CourseNote & {
//   course?: GlobalNote['course']
//   tags?: GlobalNote['tags']
// }

export type FlexibleTag = {
  tag: {
    id: string
    name: string
    userId: string | null
    createdAt?: Date // Optional!
    updatedAt?: Date // Optional!
  }
  // Join-Tabellen-Felder (optional)
  courseId?: string
  tagId?: string
  noteId?: string
  // Unsere Frontend-Flags aus dem Mapper
  isInherited?: boolean
  isAlsoInherited?: boolean
}

// 2. Wir bauen die FlexibleNote zusammen
export type FlexibleNote = Omit<CourseNote, 'tags'> & {
  tags: FlexibleTag[]
  displayTags?: FlexibleTag[]
  // WICHTIG: Wir schließen 'trainers' aus dem alten Typ aus und definieren ihn neu
  course?: Omit<NonNullable<GlobalNote['course']>, 'tags' | 'trainers'> & {
    tags: FlexibleTag[]
    trainers: { trainer: { id: string; name: string } }[] // <--- NEU: Die richtige Struktur!
  }
}

interface NotesListProps {
  notes: FlexibleNote[]
  readOnly: boolean
  from: 'courses' | 'notes'
  sortBy?: string
  emptyListMessage?: string
  activeTagIds?: string[]
}

const NotesList = ({
  notes,
  readOnly = false,
  from = 'courses',
  sortBy,
  activeTagIds,
  emptyListMessage = "You don't have any notes for this course",
}: NotesListProps) => {
  if (notes.length === 0) return <div>{emptyListMessage}</div>
  return (
    <div className="grid grid-cols-1 6xl:grid-cols-2 gap-4">
      {notes.map((note, index) => {
        // console.log(note.course?.title)
        const showHeader =
          sortBy === 'course' &&
          (index === 0 || notes[index - 1].course.id !== note.course.id)
        return (
          <Fragment key={note.id}>
            {showHeader && (
              <div className="col-span-1 6xl:col-span-2 mt-6 mb-2 first:mt-0">
                <CourseHeader
                  // Hier casten wir als 'any', weil CourseHeaderData
                  // ein isolierter Prisma-Typ ist und wir hier eine "FlexibleNote" haben
                  course={note.course /* as unknown as CourseHeaderData */}
                  variant="compact"
                  activeTagIds={activeTagIds}
                  singleCourse={false}
                />
              </div>
            )}
            <Note
              note={note}
              key={note.id}
              showCourseLink={from === 'notes'}
              activeTagIds={activeTagIds}
            />
          </Fragment>
        )
      })}
    </div>
  )
}
export default NotesList
