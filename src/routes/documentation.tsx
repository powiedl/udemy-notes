import Footer from '#/components/Footer'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
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
} from 'lucide-react'

export const Route = createFileRoute('/documentation')({
  component: RouteComponent,
})

function RouteComponent() {
  const iconClass = 'w-5 h-5 inline-block mr-2 text-(--lagoon)'

  return (
    <div className="container mx-auto py-8 max-w-4xl space-y-8">
      <h1 className="text-4xl font-bold mb-6">System Documentation</h1>
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
              Purple Theme
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>
              To distinguish user-defined metadata creation from standard
              selection, we use a<strong> purple color scheme</strong> for the
              "Create Tag" workflow.
            </p>
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
                inherited by all <strong>Notes</strong>
                belonging to that course.
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Visual cues:</strong> Inherited tags on Note cards
                  display a small <strong>Link icon</strong>
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
          <li>Search across course titles and note contents.</li>
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
    </div>
  )
}
