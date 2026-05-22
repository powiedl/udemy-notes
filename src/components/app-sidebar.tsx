'use client'

import { NavUser } from '#/components/nav-user'
import type { NavPrimaryProps } from './nav-primary'
import type { NavAdminProps } from './nav-admin'
import type { NavUserProps } from '#/components/nav-user'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
} from '#/components/ui/sidebar'

import {
  BookOpenText,
  CloudUpload,
  NotebookPen,
  Bookmark,
  BookmarkPlus,
} from 'lucide-react'
import { NavPrimary } from './nav-primary'
import { SidebarSeparator } from './ui/sidebar-ori'
import { createDefaultTagsFn } from '#/data/tag.data'
import { NavAdmin } from './nav-admin'
import { handleAction } from '#/lib/client-utils.lib'
import { useServerFn } from '@tanstack/react-start'
import { useTransition } from 'react'
import { hasRole } from '#/lib/permissions.lib'

const navItems: NavPrimaryProps['items'] = [
  {
    title: 'Courses - List',
    to: '/courses',
    icon: BookOpenText,
    activeOptions: { exact: true },
  },
  {
    title: 'Courses - Import',
    to: '/courses/import',
    icon: CloudUpload,
    activeOptions: { exact: true },
  },
  {
    title: 'Notes',
    to: '/notes',
    icon: NotebookPen,
    activeOptions: { exact: false },
  },
  {
    title: 'Tags',
    to: '/tags',
    icon: Bookmark,
    activeOptions: { exact: false },
  },
]

export function AppSidebar({ user }: NavUserProps) {
  const seedTagsFn = useServerFn(createDefaultTagsFn)
  const [isPending, startTransition] = useTransition()

  // Das Array zieht in die Komponente um, damit wir Hooks nutzen können
  const adminItems: NavAdminProps['items'] = [
    {
      title: 'seed Tags',
      icon: BookmarkPlus,
      callback: () => {
        startTransition(async () => {
          try {
            await handleAction(seedTagsFn(), {
              successToast: 'Standard-Tags wurden erfolgreich erstellt!',
            })
          } catch (error) {
            // Lautlos abfangen
          }
        })
      },
    },
  ]

  return (
    <Sidebar
      collapsible="icon"
      className="mt-16 flex justify-between h-[calc(100svh-64px)]"
    >
      <SidebarHeader>
        <SidebarTrigger className="-ml-1" />
      </SidebarHeader>
      <SidebarContent className="grow">
        <NavPrimary items={navItems} />
        {hasRole(user, 'admin') && (
          <>
            <SidebarSeparator />
            {/* Wenn du willst, könntest du isPending hier an NavAdmin übergeben 
                um den Button auf disabled zu setzen, aber für ein Admin-Tool 
                reicht das oft auch so */}
            <NavAdmin items={adminItems} isPending={isPending} />
          </>
        )}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
