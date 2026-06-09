import { Fragment } from 'react'
import type { ExtractData, ServerFnData } from '#/types/api.type'
import Note from './note'
import CourseHeader from '#/components/web/course-header'
import type {
  AwaitedReturnTypeGetNotes,
  getNotesForCourseFn,
} from '#/data/note.data'
// import { TagColor } from '#/schemas/tag.schema'
import type { DisplayTag } from '#/data/note.logic.server'
// import { CourseHeaderData } from '#/data/course'

type GlobalNote = ExtractData<AwaitedReturnTypeGetNotes>['items'][number]
type CourseNote = ServerFnData<typeof getNotesForCourseFn>['items'][number]
// type FlexibleNote = CourseNote & {
//   course?: GlobalNote['course']
//   tags?: GlobalNote['tags']
// }

// export type FlexibleTag = {
//   tag: {
//     id: string
//     name: string
//     userId: string | null
//     color: TagColor | null
//     createdAt?: Date // Optional!
//     updatedAt?: Date // Optional!
//   }
//   // Join-Tabellen-Felder (optional)
//   courseId?: string
//   tagId?: string
//   noteId?: string
//   status?: 'APPROVED' | 'SUGGESTION'
//   // Unsere Frontend-Flags aus dem Mapper
//   isInherited?: boolean
//   isAlsoInherited?: boolean
// }

// Hilfstyp, um den status-String vom Server in die erwartete Union zu zwingen
type RefinedDisplayTag = Omit<DisplayTag, 'status'> & {
  status?: 'APPROVED' | 'SUGGESTION'
}

// 2. Wir bauen die FlexibleNote zusammen
export type FlexibleNote = Omit<CourseNote, 'tags'> & {
  tags: any[]
  displayTags: RefinedDisplayTag[]
  course:
    | (Omit<NonNullable<GlobalNote['course']>, 'tags' | 'trainers'> & {
        udemyCourseId?: string | null
        tags: any[]
        trainers: { trainer: { id: string; name: string } }[]
      })
    | any
}

interface NotesListProps {
  notes: FlexibleNote[]
  readOnly?: boolean
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
                  course={note.course}
                  variant="compact"
                  activeTagIds={activeTagIds}
                  singleCourse={false}
                  readOnly={readOnly}
                />
              </div>
            )}
            <Note
              note={note}
              key={note.id}
              showCourseLink={from === 'notes'}
              activeTagIds={activeTagIds}
              readOnly={readOnly}
            />
          </Fragment>
        )
      })}
    </div>
  )
}
export default NotesList
