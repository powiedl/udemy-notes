import { Link, useLocation } from '@tanstack/react-router'
import ThemeToggle from '../ThemeToggle'
import { Button, buttonVariants } from '../ui/button'
import { authClient } from '#/lib/auth-client.lib'
import { toast } from 'sonner'
import {
  Bookmark,
  BookOpenText,
  CloudUpload,
  GithubIcon,
  Info,
  LogOut,
  NotebookPen,
} from 'lucide-react'
import { cn } from '#/lib/utils.lib'
import {
  NOTE_SEARCH_DEFAULTS,
  PAGINATION_DEFAULTS,
  TAG_PAGINATION_DEFAULTS,
} from '#/schemas/search-params.schema'

const Navbar = ({ className }: { className: string }) => {
  const { data: session, isPending } = authClient.useSession()
  const pathname = useLocation({ select: (s) => s.pathname })
  const isCoursesActive =
    pathname.startsWith('/courses') && pathname !== '/courses/import'
  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          toast.success('Signed out successfully')
        },
        onError: ({ error }) => {
          toast.error(error.message)
        },
      },
    })
  }
  return (
    <nav
      className={cn(
        'inset-x-0 z-10 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 h-16 w-full',
        className,
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-1 sm:px-2 md:px-4 pt-2">
        <div className="gap-4 flex flex-row">
          <h2 className="m-0 shrink-0 text-base font-semibold tracking-tight">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-full border border-(--chip-line) bg-(--chip-bg) px-3 py-1.5 text-sm text-(--sea-ink) no-underline shadow-[0_8px_24px_rgba(30,90,72,0.08)] sm:px-4 sm:py-2"
            >
              <span className="size-2 rounded-full bg-[linear-gradient(90deg,#56c6be,#7ed3bf)]" />
              <span className=" text-sm sm:text-lg md:text-xl">
                Udemy Notes
              </span>
            </Link>
          </h2>
          <a
            href="https://github.com/powiedl/udemy-notes"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 "
          >
            <GithubIcon className="size-4" />
            <span className="hidden lg:inline">Github Repo</span>
          </a>
        </div>
        <div className="flex gap-x-4">
          <Link
            to="/courses"
            className={cn('nav-link', isCoursesActive && 'is-active')}
            search={{ ...PAGINATION_DEFAULTS, tagIds: [], trainer: '' }}
          >
            <BookOpenText className="size-4 mr-1" />
            <span className="hidden lg:inline">Courses</span>
          </Link>
          <Link
            to="/courses/import"
            className="nav-link"
            activeProps={{ className: 'nav-link is-active' }}
          >
            <CloudUpload className="size-4 mr-1" />
            <span className="hidden lg:inline">Import Courses</span>
          </Link>
          <Link
            to="/notes"
            search={NOTE_SEARCH_DEFAULTS}
            className="nav-link"
            activeOptions={{ includeSearch: false }}
            activeProps={{ className: 'nav-link is-active' }}
          >
            <NotebookPen className="size-4 mr-1" />
            <span className="hidden lg:inline">Notes</span>
          </Link>
          <Link
            to="/tags"
            className="nav-link"
            activeOptions={{ includeSearch: false }}
            activeProps={{ className: 'nav-link is-active' }}
            search={TAG_PAGINATION_DEFAULTS}
          >
            <Bookmark className="size-4 mr-1" />
            <span className="hidden lg:inline">Tags</span>
          </Link>
        </div>
        <div className="order-3 flex flex-wrap items-center gap-x-4 gap-y-1 pb-1 text-sm font-semibold sm:w-auto sm:flex-nowrap sm:pb-0">
          <Link
            to="/documentation"
            className="nav-link"
            activeProps={{ className: 'nav-link is-active' }}
          >
            <Info className="size-4 mr-1" />
            <span className="hidden lg:inline">Docs</span>
          </Link>
          <ThemeToggle />
          {isPending ? null : session ? (
            <>
              <Button
                variant="secondary"
                onClick={handleSignOut}
                className="hover:cursor-pointer"
              >
                <LogOut className="size-4 mr-1" />
                <span className="hidden md:inline">Logout</span>
              </Button>
              {/* <Link className={buttonVariants()} to="/dashboard">
                Dashboard
              </Link> */}
            </>
          ) : (
            <>
              <Link
                className={buttonVariants({ variant: 'secondary' })}
                to="/login"
              >
                Login
              </Link>
              <Link className={buttonVariants()} to="/signup">
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}

export default Navbar
