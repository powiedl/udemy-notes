import Footer from '#/components/Footer'
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
} from 'lucide-react'

export const Route = createFileRoute('/documentation')({
  component: RouteComponent,
})

function RouteComponent() {
  const iconClass = 'w-5 h-5 inline-block mr-2 text-(--lagoon)'

  return (
    <div className="flex flex-col min-h-full">
      <main className="flex min-h-full flex-col px-4 py-8 mx-auto *:w-full *:max-w-4xl *:mx-auto gap-6">
        {/* Header Section */}
        <section className="island-shell rounded-2xl p-6 sm:p-8">
          <p className="island-kicker mb-2">Help & Documentation</p>
          <h1 className="display-title mb-3 text-xl font-bold text-(--sea-ink) sm:text-3xl">
            Master your Udemy Learning Experience
          </h1>
          <p className="text-base leading-8 text-(--sea-ink-soft)">
            This guide explains how to effectively manage your imported notes,
            use our tagging system, and organize your knowledge base.
          </p>
        </section>

        {/* Import Section */}
        <section className="island-shell rounded-2xl p-6 sm:p-8">
          <h2 className="display-title mb-4 text-lg font-bold text-(--sea-ink) sm:text-2xl flex items-center">
            <CloudUpload className={cn('size-4 mr-1', iconClass)} />
            Importing Courses
          </h2>
          <p className="text-base leading-8 text-(--sea-ink-soft) mb-4">
            To get started, follow the instructions on the{' '}
            <Link
              to="/"
              className="text-(--lagoon) font-semibold hover:underline"
            >
              Home page
            </Link>{' '}
            to obtain your Udemy notes HTML file.
          </p>
          <p className="text-base leading-8 text-(--sea-ink-soft) mb-4">
            The HTML file is preprocessed on your computer (only the title and
            the notes itself get passed to the server). This is done to keep
            your mail address (which is stored in the Udemy HTML file) at your
            computer and to reduce network traffic.
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
          <h2 className="display-title mb-4 text-lg font-bold text-(--sea-ink) sm:text-2xl flex items-center">
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
                  Downloads your course notes as a beautifully formatted .md
                  file for Obsidian, Notion or other tools.
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

        {/* Tag Management */}
        <section className="island-shell rounded-2xl p-6 sm:p-8">
          <h2 className="display-title mb-4 text-lg font-bold text-(--sea-ink) sm:text-2xl flex items-center">
            <Tag className={iconClass} /> The Tagging System
          </h2>
          <div className="space-y-6 text-base leading-7 text-(--sea-ink-soft)">
            <div>
              <h3 className="font-bold text-(--sea-ink) mb-1">
                Public vs. Private Tags
              </h3>
              <p>
                <strong>Public tags</strong> are global categories (e.g.,
                "React", "Frontend") shared by all users.{' '}
                <strong>Private tags</strong> are your personal labels, visible
                only to you, perfect for project-specific or sensitive
                organization.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-(--sea-ink) mb-1">
                Inheritance & The Link Symbol
              </h3>
              <p>Tags can be assigned at two levels:</p>
              <ul className="list-disc ml-5 mt-2 space-y-2">
                <li>
                  <strong>Course Level:</strong> A tag assigned to a course is
                  automatically "inherited" by every single note in that course.
                </li>
                <li>
                  <strong>Note Level:</strong> You can also assign tags to
                  specific individual notes for precise categorization.
                </li>
              </ul>
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-start gap-3 border border-blue-100 dark:border-blue-800/50">
                <LinkIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-1" />
                <p className="text-sm text-blue-900 dark:text-blue-100 leading-relaxed">
                  <strong>The Link Symbol:</strong> If you see a small link icon
                  on a tag within a note, it means this tag is{' '}
                  <strong>inherited from the course</strong>. You cannot remove
                  it from the note directly; you must remove it from the course
                  header. Tags without this icon are attached directly to that
                  specific note.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Searching & Sorting */}
        <section className="island-shell rounded-2xl p-6 sm:p-8 mb-8">
          <h2 className="display-title mb-4 text-lg font-bold text-(--sea-ink) sm:text-2xl flex items-center">
            <Search className={iconClass} /> Finding Information
          </h2>
          <p className="text-base leading-8 text-(--sea-ink-soft)">
            Our search is designed to be fast and persistent. When you search
            for text or filter by tags, the URL updates automatically. This
            means you can bookmark specific searches or use the browser's
            back/forward buttons.
          </p>
          <ul className="list-disc ml-5 mt-4 text-sm text-(--sea-ink-soft) space-y-1">
            <li>Search across course titles and note contents.</li>
            <li>
              Sort notes by "Newest first", "Oldest first", or "Grouped by
              course".
            </li>
          </ul>
        </section>
      </main>
      <Footer />
    </div>
  )
}
