import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import appCss from '../styles.css?url'
import { TooltipProvider } from '#/components/ui/tooltip'
import { Toaster } from 'sonner'
import Navbar from '#/components/web/nav-bar'
import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'

// const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Udemy Notes',
      },
      {
        name: 'description',
        content:
          'You can upload your Udemy Notes and - for now - you get a clean structured markdown file back. In the future you will be able to manage your notes in this Web Application.',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      { rel: 'icon', href: '/u-notes-logo_optimized_4.png' },
    ],
  }),
  shellComponent: RootDocument,

  notFoundComponent: () => <div>Sorry, the url you tried was not found :(</div>,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const { queryClient } = Route.useRouteContext()
  useEffect(() => document.documentElement.classList.remove('preload'), [])
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var stored = window.localStorage.getItem('theme-cache');
                var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                var theme = stored || 'system';
                var resolved = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
                
                document.documentElement.classList.add(resolved);
                document.documentElement.classList.add('preload');
                if (theme !== 'system') {
                  document.documentElement.setAttribute('data-theme', theme);
                }
                document.documentElement.style.colorScheme = resolved;
              } catch (e) {}
            `,
          }}
        />
      </head>
      {/* h-full und overflow-hidden auf dem body verhindert das "Wackeln" des gesamten Fensters */}
      <body className="font-sans antialiased wrap-anywhere selection:bg-violet-200 bg-linear-60 from-hero-a to-hero-b h-full overflow-hidden">
        <TooltipProvider>
          <QueryClientProvider client={queryClient}>
            <div className="flex h-full flex-col">
              <Navbar className="h-16 flex-none" />{' '}
              {/* Navbar hat feste Höhe, wächst nicht */}
              <div className="flex-1 overflow-y-auto min-h-0">
                {/* Dieser Bereich scrollt im Basislayout */}
                {children}
              </div>
            </div>
          </QueryClientProvider>
        </TooltipProvider>
        <Toaster
          closeButton
          position="top-right"
          richColors // Ermöglicht farbige Toasts und korrekt gestylte Buttons
          expand={true} // Hilft, wenn der Toast viel Inhalt (wie die ID) hat
        />
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',

              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
