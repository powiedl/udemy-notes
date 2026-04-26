import Footer from '#/components/Footer'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import TagBadge from '#/components/web/tag-badge'
import { cn } from '#/lib/utils'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Info,
  Tag,
  Trash2,
  Download,
  Search,
  Link as LinkIcon,
  CloudUpload,
  Link2,
  Plus,
  User,
} from 'lucide-react'

export const Route = createFileRoute('/documentation')({
  component: RouteComponent,
})

function RouteComponent() {
  const iconClass = 'w-5 h-5 inline-block mr-2 text-(--lagoon)'

  return (
    <div className="container mx-auto py-8 max-w-4xl space-y-8">
      <h1 className="text-4xl font-bold mb-6">User Documentation</h1>
      {/* Import Section */}
      <section className="island-shell rounded-2xl p-6 sm:p-8">
        <h2 className="mb-4 text-lg font-bold text-(--sea-ink) sm:text-2xl flex items-center">
          <CloudUpload className={cn('size-4 mr-1', iconClass)} />
          Importing Courses
        </h2>
        <p className="text-base leading-8 text-(--sea-ink-soft) mb-4">
          To get started, follow the instructions on the{' '}
          <Link to="/" className="text-lagoon font-semibold hover:underline">
            Home page
          </Link>{' '}
          to obtain your Udemy notes HTML file.
        </p>
        <p className="text-base leading-8 text-(--sea-ink-soft) mb-4">
          The HTML file is preprocessed on your computer (only the title and the
          notes itself get passed to the server). This is done to keep your mail
          address (which is stored in the Udemy HTML file) at your computer and
          to reduce network traffic.
        </p>
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800/50">
          <ul className="list-disc ml-5 space-y-2 text-sm text-blue-900 dark:text-blue-100">
            <li>
              <strong>Trainer Name:</strong> You can optionally specify the
              trainer of the course during import for better filtering later.
            </li>
            <li>
              <strong>Initial Tags:</strong> Add tags directly during import.
              These will be applied to the <strong>entire course</strong> and
              inherited by all notes within it.
            </li>
            <li>
              <strong>Private vs Public:</strong> You can create new private
              tags during import that only you can see.
            </li>
          </ul>
        </div>
      </section>
      {/* Course Management */}
      <section className="island-shell rounded-2xl p-6 sm:p-8">
        <h2 className="mb-4 text-lg font-bold text-(--sea-ink) sm:text-2xl flex items-center">
          <Info className={iconClass} /> Course Functions
        </h2>
        <p className="text-base leading-8 text-(--sea-ink-soft) mb-4">
          In your course overview or the individual course view, you have
          several quick actions:
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex gap-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800/50">
            <Download className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <div>
              <p className="font-bold text-sm text-blue-900 dark:text-blue-100">
                Export to Markdown
              </p>
              <p className="text-xs text-blue-800/80 dark:text-blue-200/80 leading-relaxed">
                Downloads your course notes as a beautifully formatted .md file
                for Obsidian, Notion or other tools.
              </p>
            </div>
          </div>
          <div className="flex gap-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800/50">
            <Trash2 className="w-5 h-5 text-destructive shrink-0" />
            <div>
              <p className="font-bold text-sm text-blue-900 dark:text-blue-100">
                Delete Course
              </p>
              <p className="text-xs text-blue-800/80 dark:text-blue-200/80 leading-relaxed">
                Permanently removes the course and all associated notes from
                your account.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Trainer Management */}
      <section className="island-shell rounded-2xl p-6 sm:p-8">
        <h2 className="mb-4 text-lg font-bold text-(--sea-ink) sm:text-2xl flex items-center">
          <User className={iconClass} /> Trainer Management
        </h2>
        <p className="text-base leading-8 text-(--sea-ink-soft) mb-4">
          Trainers are handled as global resources to ensure a consistent
          database across all users.
        </p>
        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 border border-emerald-100 dark:border-emerald-800/50">
          <ul className="list-disc ml-5 space-y-2 text-sm text-emerald-900 dark:text-emerald-100">
            <li>
              <strong>Public Access:</strong> Every user can create new trainers
              and assign them to their courses.
            </li>
            <li>
              <strong>Data Integrity:</strong> Since trainers are "public" and
              shared system-wide, they{' '}
              <strong>cannot be renamed or deleted</strong> by users. This
              ensures that metadata remains stable for everyone who has linked
              to that trainer.
            </li>
          </ul>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <Tag className="text-primary" /> Tag Management & Inheritance
        </h2>
        <p className="text-muted-foreground">
          Our application employs a unified tagging system to help you
          categorize your learning materials. Tags can be applied to both{' '}
          <strong>Courses</strong> and individual <strong>Notes</strong>.
        </p>

        <Card className="border-l-4 border-l-purple-500 shadow-md">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="text-purple-500 h-5 w-5" /> Private Tags & The
              Purple Theme, Renaming & Deletion
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              To distinguish user-defined metadata from standard selection, we
              use a<strong> blue color scheme</strong> for the
              <TagBadge
                tag={{
                  id: 'documentation-private-tag',
                  name: 'private metadata',
                  userId: 'documentation-user',
                }}
                className="align-middle mx-1"
              />
            </div>
            <div className="bg-accent/50 p-4 rounded-md border text-sm">
              <p className="font-semibold mb-2 underline underline-offset-4">
                How to create and link new private tags:
              </p>
              <ol className="list-decimal pl-5 space-y-2">
                <li>
                  Click the <strong>"+"</strong> button in the Tag Manager
                  (found in Course Headers or Note Cards).
                </li>
                <li>
                  Enter the name of your new tag in the search input field.
                </li>
                <li>
                  If the tag does not yet exist, a purple{' '}
                  <strong>"Create tag"</strong> button appears automatically in
                  the dropdown.
                </li>
                <li>
                  Press <strong>Enter</strong> or click that button to create
                  the tag globally. It will be immediately assigned to the
                  current entity (Course or Note).
                </li>
                <li>
                  <strong>Renaming & Deleting:</strong> Private tags can be
                  managed via the <strong>"Tags"</strong> page. Unlike trainers,
                  you can rename or delete your private tags. When deleting, a
                  warning will inform you about the exact number of courses and
                  notes currently associated with that tag.
                </li>
              </ol>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6 mt-8">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Link2 className="text-blue-500 h-5 w-5" /> Tag Inheritance
                Logic
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                Tags assigned to a <strong>Course</strong> are automatically
                inherited by all <strong>Notes</strong> belonging to that
                course.
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Visual cues:</strong> Inherited tags on Note cards
                  display a small{' '}
                  <strong>
                    Link icon <LinkIcon className="size-4 inline" />
                  </strong>{' '}
                  next to their name.
                </li>
                <li>
                  <strong>Read-only status:</strong> You cannot remove inherited
                  tags directly from a Note card. To remove them, you must
                  unbind them from the parent Course.
                </li>
                <li>
                  <strong>Deduplication:</strong> The system detects if a Note
                  is manually tagged with a tag it already inherits, labeling it
                  as a "direct tag (but also inherited)". This ensures the tag
                  persists even if the course association is removed.
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Info className="text-amber-500 h-5 w-5" /> Assignment Rules
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                Quickly assign existing tags by searching the global registry
                via the Tag Manager popover.
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  Selecting an existing tag from the list creates an immediate
                  association.
                </li>
                <li>
                  Assignment actions are performed using React Transitions,
                  keeping the UI responsive while the server processes the
                  update.
                </li>
                <li>
                  Detailed tooltips on Note tag badges provide full transparency
                  regarding the source of the tag (e.g., "inherited from course"
                  vs. "direct tag").
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>
      {/* Searching & Sorting */}
      <section className="island-shell rounded-2xl p-6 sm:p-8 mb-8">
        <h2 className="mb-4 text-lg font-bold text-(--sea-ink) sm:text-2xl flex items-center">
          <Search className={iconClass} /> Finding Information
        </h2>
        <p className="text-base leading-8 text-(--sea-ink-soft)">
          Our search is designed to be fast and persistent. When you search for
          text or filter by tags, the URL updates automatically. This means you
          can bookmark specific searches or use the browser's back/forward
          buttons.
        </p>
        <ul className="list-disc ml-5 mt-4 text-sm text-(--sea-ink-soft) space-y-1">
          <li>
            Search across course titles and trainers (in the Courses page) and
            note contents (in the Notes page).
          </li>
          <li>
            Sort notes by "Newest first", "Oldest first", or "Grouped by
            course".
          </li>
          <li>
            If you search for (multiple) tags, the found tags in the course/note
            tags are highlighted - so you can see immediately why a specific
            course/note is listed as a search result
          </li>
        </ul>
      </section>
      <Footer />
    </div>
  )
}
