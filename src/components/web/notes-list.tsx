import { AwaitedReturnTypeGetCourseById } from '#/data/course'
import Note from './note'

const NotesList = ({
  notes,
}: {
  notes: AwaitedReturnTypeGetCourseById['notes']
}) => {
  if (notes?.length === 0)
    return <div>You don't have any notes for this course</div>
  return (
    <div className="grid grid-cols-1 6xl:grid-cols-2 gap-4">
      {notes.map((note) => (
        <Note note={note} key={note.id} />
      ))}
    </div>
  )
}
export default NotesList
