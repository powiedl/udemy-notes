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
import { linkOptions } from '@tanstack/react-router'
import { NavPrimary } from './nav-primary'
import { SidebarSeparator } from './ui/sidebar-ori'
import { createDefaultTags } from '#/data/tag'
import { NavAdmin } from './nav-admin'
import { seedTagging } from '#/data/seeding'
import { toast } from 'sonner'
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

async function runTaggingSeed() {
  const tagging = [
    {
      type: 'course' as const,
      parentId: 'd3af4849-3056-4094-a430-2701957f8712',
      tagId: '508f7dd3-0420-4527-a464-492892fa90e1',
    },
    {
      type: 'course' as const,
      parentId: 'd3af4849-3056-4094-a430-2701957f8712',
      tagId: '51eebd20-aefd-45a9-9f25-146966fe5fac',
    },
    {
      type: 'note' as const,
      parentId: '9bbed96c-d835-4ebb-a144-86d194f54384',
      tagId: '508f7dd3-0420-4527-a464-492892fa90e1',
    },
    {
      type: 'note' as const,
      parentId: '9bbed96c-d835-4ebb-a144-86d194f54384',
      tagId: '51eebd20-aefd-45a9-9f25-146966fe5fac',
    },
    {
      type: 'note' as const,
      parentId: 'cfe3a3ce-6d1d-4777-b4ed-bbc3664369a7',
      tagId: '51eebd20-aefd-45a9-9f25-146966fe5fac',
    },
  ]
  try {
    // Vollständig typsicher! TS meckert, wenn die Struktur nicht stimmt.
    const result = await seedTagging({
      data: { relations: tagging },
    })

    if (result.success) {
      toast.success(`${result.count} Tags wurden erfolgreich verknüpft.`)
    }
  } catch (err) {
    toast.error('Seeding fehlgeschlagen.')
  }
}

const adminItems: NavAdminProps['items'] = [
  { title: 'seed Tags', callback: createDefaultTags, icon: BookmarkPlus },
  {
    title: 'seed Tagging',
    callback: runTaggingSeed,
    icon: BookmarkPlus,
  },
]

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
        {user.email === 'tim@tom.io' && (
          <>
            <SidebarSeparator />
            <NavAdmin items={adminItems} />
          </>
        )}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      {/* <SidebarRail /> */}
    </Sidebar>
  )
}
