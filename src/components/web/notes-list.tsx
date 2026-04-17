import { Fragment } from 'react'
import { ExtractData } from '#/types/api'
import Note from './note'
import CourseHeader from '#/components/web/course-header'
// WICHTIG: Passe diesen Import an deinen tatsächlichen Typen an!
import { AwaitedReturnTypeGetNotes } from '#/data/note'
import { AwaitedReturnTypeGetCourseById } from '#/data/course'

type GlobalNote = ExtractData<AwaitedReturnTypeGetNotes>['items'][number]
type CourseNote = ExtractData<AwaitedReturnTypeGetCourseById>['notes'][number]

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
  tags: FlexibleTag[] // Die rohen Tags der Notiz überschreiben
  displayTags?: FlexibleTag[] // Unser neues, gemapptes Array!
  course?: Omit<NonNullable<GlobalNote['course']>, 'tags'> & {
    tags: FlexibleTag[] // Die rohen Tags des Kurses überschreiben
  }
}

interface NotesListProps {
  notes: FlexibleNote[]
  sortBy?: string
  emptyListMessage?: string
}

const NotesList = ({
  notes,
  sortBy,
  emptyListMessage = "You don't have any notes for this course",
}: NotesListProps) => {
  if (notes?.length === 0) return <div>{emptyListMessage}</div>
  return (
    <div className="grid grid-cols-1 6xl:grid-cols-2 gap-4">
      {notes.map((note, index) => {
        //console.log(note.course?.title)
        const showHeader =
          sortBy === 'course' &&
          note.course &&
          (index === 0 || notes[index - 1].course?.id !== note.course.id)
        return (
          <Fragment key={note.id}>
            {showHeader &&
              note.course && ( // wenn note.course undefined wäre, wäre showHeader false
                <div className="col-span-1 6xl:col-span-2 mt-6 mb-2 first:mt-0">
                  <CourseHeader
                    course={note.course} // (Je nach TypeScript-Strenge evtl. casten)
                    variant="compact"
                  />
                </div>
              )}
            <Note
              note={note}
              key={note.id}
              showCourseLink={sortBy !== 'course'}
            />
          </Fragment>
        )
      })}
    </div>
  )
}
export default NotesList
