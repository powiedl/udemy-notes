# Welcome to udemy-notes!

This is a hobby project to work with your notes of your Udemy courses. Right now you can use it to convert your udemy notes to a .md file. Therefore you have to register with your email adress (right now also dummy mail addresses are working).

If the app gets finished you will be able to import your course notes to the app, edit them inside the app, tag your notes, search your notes (and public notes from other users).

You find the hosted app at [https://udemy-notes.vercel.app](https://udemy-notes.vercel.app)

## Current project status

- You can upload a html file with your Udemy course notes
- These course notes are stored in the database
- You can view your notes of the course - in the course details page
- You can export your notes of the course - in the course details page
- You can Delete a course - in the course details and overview page
- You can add tags to a course - in the course details and overview page
- You can add tags to a single note - everywhere you see the note
- You can create your own tags - in the Tags page (and also on demand where ever you can add existing tags)
- You can get a list of all notes from all your courses (and have multiple filtering and sorting options for this list)

## Next steps

- [] search for courses and notes with tags assigned
- [] FINALLY: Edit your notes in the App

## Learnings

- [SERVER-FUNCTION-SYSTEM](SERVER-FUNCTION-SYSTEM_ENGLISH.md) - how to setup strong typed Server Functions with a standard return type for every server function. Add a possibility to log errors to the database (with the possibility to add a reference to the calling frontend component and the server function causing the error)
  - [German original](SERVER-FUNCTION-SYSTEM.md)
- [LEITFADEN PERFORMANTE SUCHE UND PAGINATION MIT TANSTACK START](GUIDE-PERFORMANT-SEARCH-AND-PAGINATION-WITH-TANSTACK-START_ENGLISH) - how to setup a general search and pagination container for "all" of your pages, where this makes sense. Right now it is only implemented in the Courses page, but will be added to additional routes in the future (to see if it is really "general")
  - [German original](LEITFADEN-PERFORMANTE-SUCHE-UND-PAGINATION-MIT-TANSTACK-START.md)

### Misc knowledge gems

#### useNavigate

If you use the `useNavigate` function (which returns the navigate function, which you can use to navigate to a different route or to the same route but with different searchParams) it is useful to pass an object with the current route - otherwise Typescript gets nervous, because it doesn't know if it is safe to call the new navigation target: `const navigate = useNavigate({from: Route.fullPath})`
