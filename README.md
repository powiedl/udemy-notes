# Welcome to udemy-notes!

This is a hobby project to work with your notes of your Udemy courses. To use this app you have to register with your email adress (right now also dummy mail addresses are working).

By June 2026 it seems, that Udemy is changing it's web site (the layout of the course page, e. g. the notes are no longer under the video, but beside it). I'm happy, that this app already is able to process this new format. And the good news: Udemy added more data to the html, so we can scrape the complete trainer information (and you don't have to enter the trainer names manually anymore).

You find the hosted app at [https://udemy-notes.vercel.app](https://udemy-notes.vercel.app)

## Current project status

- You can import a html file with your Udemy course notes (during import you can assign tags and trainers to the course)
  - You can also import a previous exported markdown file (if you export the metadata this will be used to ensure that you can successfully update the course in the database - if the metadata is manipulated you will get a warning, that the import will delete the course in the database)
- These courses and the corresponding notes are stored in the database
- You can view and edit your notes of the course - in the course details page
- You can export your notes of the course - in the course details page
- You can delete a course - in the course details and overview page
- You can add tags to a course - in the course details and overview page
- You can add tags to a single note - everywhere you see the note
- You can create tag suggestions with an AI auto tagging feature
- You can create a public link (which works for 7 days) of your course - so you can share your notes with your friends
- You can create your own tags, rename and delete them
- You can create trainers and assign them to your courses (but you cannot delete or rename them as they are shared between all users - with the new format of the Udemy HTML it is no longer needed)
- You can get a list of all notes from all your courses (and have multiple filtering and sorting options for this list)
- You can change the color of private tags (in the Tags page) - by clicking the colorful circle in the left bottom corner of the tag and then selecting a different color by clicking the correct circle.

## Next steps

For now I don't have any "must have" improvements for the app in the queue, just some little tweaks here and there ...

## Learnings

- [SERVER FUNCTION SYSTEM](./docs/en/SERVER-FUNCTION-SYSTEM.md) - how to setup strong typed Server Functions with a standard return type for every server function. Add a possibility to log errors to the database (with the possibility to add a reference to the calling frontend component and the server function causing the error)
  - [German original](./docs/de/SERVER-FUNCTION-SYSTEM.md)
- [GUIDE: PERFORMANT SEARCH AND PAGINATION WITH TANSTACK START](./docs/en/GUIDE-PERFORMANT-SEARCH-AND-PAGINATION-WITH-TANSTACK-START.md) - how to setup a general search and pagination container for "all" of your pages, where this makes sense. Right now it is only implemented in the Courses page, but will be added to additional routes in the future (to see if it is really "general")
  - [German original](./docs/de/LEITFADEN-PERFORMANTE-SUCHE-UND-PAGINATION-MIT-TANSTACK-START.md)
- [PRISMA WORKFLOW & MIGRATION GUIDE](./docs/en/PRISMA-EXPLANATION-AND-WORKFLOW.md) - how to work with PRISMA and in which situation you should use which commands.
  - [German original](./docs/de/PRISMA-ERKLAERUNG-UND-WORKFLOW.md)
- [CI-CD-SETUP-NEON-VERCEL-AND-GITHUB-ACTIONS](./docs/en/CI-CD-SETUP-NEON-VERCEL-AND-GITHUB-ACTIONS.md) - how to setup a CI/CD pipeline with protection of master branch, automatic tests during pull requests and cleanup of neon database branches after the pull request has been merged.
  - [German orginal](./docs/de/CI-CD-SETUP-NEON-VERCEL-UND-GITHUB-ACTIONS.md)
- [ARCHITECTURE DOCUMENTATION: FORM SYSTEM WITH @tanstack/react-form](./docs/en/FORM-SYSTEM-TANSTACK-REACT-FORM.md) - how to setup @tanstack/react-form and use a form debugger during development. It also contains "guidelines" for forms in this project
  - [German original](./docs/de/FORMULAR-SYSTEM-TANSTACK-REACT-FORM.md)

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

#### Typescript Warning possibly null inside of async closures

Sometimes Typescript forgets that you've checked for "not null" outside of a closure inside of that closure (because it knows that there is some delay between the check and the actual execution of the closure - where something could have changed that value to null, if null is an allowed type for that value). To solve this you have to assign the value to a const (so Typescript knows it is not possible, that this value may change over time) and then use that const in your closure. For example

```typescript
onSubmit: async({value}) => {
  const file=value.file
  if (!file) return

  startTransition(async() => {
    try {
      const rawHtml=await file.text() // no Problem
      // const rawHtml=await value.file.text() // PROBLEM: possibly null !
    }
  })
}
```

#### Disable Linter for TanStack Start generated code

If you try to solve linting errors in the generated code of TanStack Start you're fighting against windmills, so it is "safe" to disable the linting for the generated TanStack Start code. You do this by exending the ignores array of `/eslint.config.js`

```javascript
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      '**/routeTree.gen.ts', // add this line
      '*.output/**',         // add this line
    ],
```

#### difference between React.ReactNode and React.ElementType

`React.ReactNode` is a complete React node. All properties (e.g. className) are under the control of the calling component. Whereas `React.ElementType` is just the Type of the node, all properties are under control of the called component. You can see the difference in the `TagBadge` component:

```typescript
export interface TagBadgeProps {
  ...
  icon?: React.ReactNode
  DeleteIcon?: React.ElementType
}
...
  <Badge variant="outline" className={badgeClassName} title={title}>
    <span className="truncate max-w-40 flex flex-row gap-0.5 items-center">
      {icon} // the icon Node is just presented (the TagBadge component can't add things to it)
...
    <DeleteIcon className="size-3.5" /> // "everything" (className) is controlled by the TagBadge component
...
```

Call of the TagBade component - where you can also see the difference

```typescript
  <TagBadge icon={<Link2 className='size-3'>} DeleteIcon={Trash2}>
```

#### zod Validation of a string literal union type (type Themes = 'light' | 'dark' | 'system')

If you define the Typescript type like it is done in the heading, then you get a problem if you also want to use a zod validation (because zod is active at runtime, but Typescript is active at development time and the Typescript type Themes is "gone" at runtime).

To solve this issue, you can "flip" the definition (so create a Javascript Array with the valid names and infer the Typescript type from this array):

```typescript
const THEMES = ['light', 'dark', 'system'] as const
const Themes = typeof THEMES[number]

const themeSchema = z.enum(THEMES)
```

With this you have the type safety, you only have to change one place to change the themes (the Javascript array THEMES) and you have a zodSchema which can validate the themes. The example is simplified, normally the schema for the theme would be a part of a "bigger" Schema (e. g. settingsSchema).
