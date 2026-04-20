import Footer from '#/components/Footer'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: App })

function App() {
  return (
    <div className="flex flex-col min-h-full">
      <main className="flex min-h-full flex-col px-4 py-4 mx-auto *:w-full *:max-w-4xl *:mx-auto gap-4">
        <section className="island-shell rounded-2xl p-6 sm:p-8">
          <p className="island-kicker mb-2">About</p>
          <h1 className="display-title mb-3 text-xl font-bold text-(--sea-ink) sm:text-3xl">
            All your notes of your Udemy courses
          </h1>
          <p className="m-0 max-w-3xl text-base leading-8 text-(--sea-ink-soft)">
            With
            <span className="text-xl font-600 mx-2 text-lagoon">
              Udemy Notes
            </span>
            you can import your notes from Udemy, edit and tag them, search
            inside of them and export them to Markdown files.
          </p>
        </section>
        <section className="island-shell rounded-2xl p-6 sm:p-8">
          <h2 className="display-title mb-3 text-xl font-bold text-(--sea-ink) sm:text-3xl">
            How to import your Udemy notes
          </h2>
          <ol className="ml-4 list-decimal m-0 max-w-3xl text-base leading-8 text-(--sea-ink-soft)">
            <li>Go to the course page in udemy and select your notes</li>
            <li>
              Open the Developer Tools of your browser and go to the Elements
              view
            </li>
            <li>
              Select the root node (html) by clicking on it and then copy the
              element (<strong>inner html</strong>) - normally you find this
              option in the context menu (do <strong>NOT</strong> copy the page
              source code, because it doesn't contain the notes - it only
              contains the scripts which load the notes)
            </li>
            <li>
              Open an editor, paste the root element into and save the file as
              <span className="text-muted-foreground/90 font-semibold">
                {' '}
                .html
              </span>
            </li>
            <li>
              Go to <Link to="/courses/import">import</Link> to import your
              course file
            </li>
          </ol>
        </section>
      </main>
      <Footer />
    </div>
  )
}
