'use client'

import { NavUser } from '#/components/nav-user'
import type { NavPrimaryProps, NavUserProps } from '#/lib/types'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
} from '#/components/ui/sidebar'

import { BookOpenText, CloudUpload, NotebookPen, Bookmark } from 'lucide-react'
import { linkOptions } from '@tanstack/react-router'
import { NavPrimary } from './nav-primary'

const navItems: NavPrimaryProps['items'] = linkOptions([
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
])

export function AppSidebar({ user }: NavUserProps) {
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
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      {/* <SidebarRail /> */}
    </Sidebar>
  )
}
