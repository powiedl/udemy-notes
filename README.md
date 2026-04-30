# Welcome to udemy-notes!

This is a hobby project to work with your notes of your Udemy courses. Right now you can use it to convert your udemy notes to a .md file. Therefore you have to register with your email adress (right now also dummy mail addresses are working).

If the app gets finished you will be able to import your course notes to the app, edit them inside the app, tag your notes, search your notes (and public notes from other users).

You find the hosted app at [https://udemy-notes.vercel.app](https://udemy-notes.vercel.app)

## Current project status

- You can import a html file with your Udemy course notes (during import you can assign tags and trainers to the course)
- These courses ant the corresponding notes are stored in the database
- You can view and edit your notes of the course - in the course details page
- You can export your notes of the course - in the course details page
- You can delete a course - in the course details and overview page
- You can add tags to a course - in the course details and overview page
- You can add tags to a single note - everywhere you see the note
- You can create your own tags, rename and delete them
- You can create trainers and assign them to your courses (but you cannot delete or rename them as they are shared between all users)
- You can get a list of all notes from all your courses (and have multiple filtering and sorting options for this list)

## Next steps

For now I don't have any "must have" improvements for the app in the queue, just some little tweaks here and there ...

## Learnings

- [SERVER-FUNCTION-SYSTEM](./docs/en/SERVER-FUNCTION-SYSTEM.md) - how to setup strong typed Server Functions with a standard return type for every server function. Add a possibility to log errors to the database (with the possibility to add a reference to the calling frontend component and the server function causing the error)
  - [German original](./docs/de/SERVER-FUNCTION-SYSTEM.md)
- [LEITFADEN PERFORMANTE SUCHE UND PAGINATION MIT TANSTACK START](./docs/en/GUIDE-PERFORMANT-SEARCH-AND-PAGINATION-WITH-TANSTACK-START.md) - how to setup a general search and pagination container for "all" of your pages, where this makes sense. Right now it is only implemented in the Courses page, but will be added to additional routes in the future (to see if it is really "general")
  - [German original](./docs/de/LEITFADEN-PERFORMANTE-SUCHE-UND-PAGINATION-MIT-TANSTACK-START.md)
- [PRISMA-EXPLANATION-AND-WORKFLOW_ENGLISH](./docs/en/PRISMA-EXPLANATION-AND-WORKFLOW.md) - how to work with PRISMA and in which situation you should use which commands.
  - [German original](./docs/de/PRISMA-ERKLAERUNG-UND-WORKFLOW.md)
- [CI-CD-SETUP-NEON-VERCEL-AND-GITHUB-ACTIONS](./docs/en/CI-CD-SETUP-NEON-VERCEL-AND-GITHUB-ACTIONS.md) - how to setup a CI/CD pipeline with protection of master branch, automatic tests during pull requests and cleanup of neon database branches after the pull request has been merged.
  - [German orginal](./docs/de/CI-CD-SETUP-NEON-VERCEL-UND-GITHUB-ACTIONS.md)

### Misc knowledge gems

#### useNavigate

If you use the `useNavigate` function (which returns the navigate function, which you can use to navigate to a different route or to the same route but with different searchParams) it is useful to pass an object with the current route - otherwise Typescript gets nervous, because it doesn't know if it is safe to call the new navigation target: `const navigate = useNavigate({from: Route.fullPath})`

#### useLoaderData of parent routes

Sometimes multiple sub routes need the same (static) data, then it can be a good approach to fetch this data on a common parent route with the loader of the parent route. The loader of the parent route doesn't retrigger if a loader on a sub route triggers. We use this pattern to get the list of available tags in the `#/routes/_content/index.tsx` route (and use them in the sub routes `courses` and `notes`).

##### loader of the \_content route (which also fetches the session for all sub routes)

```typescript
export const Route = createFileRoute('/_content')({
  component: RouteComponent,
  loader: async () => {
    const [sessionResult, tagsResult] = await Promise.all([
      getSessionFn(),
      getTagsForSelectorFn({
        data: { loggingMetadata: { component: 'MainLayoutLoader' } },
      }),
    ])

    if (!sessionResult.success) {
      throw new Error(
        sessionResult.error || 'Session konnte nicht geladen werden',
      )
    }

    return {
      user: sessionResult.data.user,
      availableTags: tagsResult?.success ? tagsResult.data : [],
    }
  },
})
```

##### using the available tags in a sub route (in this example in the #/routes/\_content/notes/index.tsx)

```typescript
import { getRouteApi } from '@tanstack/react-router'
const layoutRouteApi = getRouteApi('/_content') // define a reference to the parent route

function RouteComponent() {
  const { availableTags } = layoutRouteApi.useLoaderData() // after this line there is no difference between data fetched from the local loader or from the parent loader
}
```

#### showing the active route in a navbar

If you want to show the active route in a navbar (to help the user to orientate on your page) you can use the build in Props `activeOptions` (to determine which parts of the path are checked to determine if the current path belongs to this Link) and `activeProps` (if it belongs to the Link what should happen with the link).

`activeOptions` support some properties, to help in many cases. `exact:boolean` (if it is set to true, the current path must match the link target completly, e. g. `to='/courses'` does not match `'/courses/123'` if `exact===true`, but it matches, if `exact===false`). Other properties are `includeSearch:boolean` and `includeHash:boolean`, which can be used to ignore search Params and a hash value in the url.

But sometimes all this possibilities aren't good enough, e. g. our courses route. We want it to be active, when we are in the "overview" of the courses and also if we are seeing one special course (where the id of the course is appended to the url), but we don't want it to be active, if we are at the import course route (`/courses/import`). This requirement can't be solved by the built in mechanics, but we can control the active state completly by our own:

```typescript
// in the nav-bar.tsx component inside the component function:
  const pathname = useLocation({ select: (s) => s.pathname })
  const isCoursesActive =
    pathname.startsWith('/courses') && pathname !== '/courses/import' // every url, that starts with /courses - except /courses/import is considered as part of the Courses link
...
  <Link
    to="/courses"
    className={cn('nav-link', isCoursesActive && 'is-active')}
    search={{ ...PAGINATION_DEFAULTS, tagIds: [], trainer: '' }}
  >
```

Here we add the `is-active` class, if `isCoursesActive` is `true`. And the `is-active` class has all the styling for our "active nav link".
