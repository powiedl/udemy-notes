'use client'

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '#/components/ui/sidebar'
import type { NavAdminProps } from '#/lib/types'
import { ShieldUser } from 'lucide-react'
import { Button } from './ui/button'
import { SidebarMenuSub } from './ui/sidebar-ori'

export function NavAdmin({ items }: NavAdminProps) {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton>
              <ShieldUser />
              Admin
            </SidebarMenuButton>
            <SidebarMenuSub>
              {items.map((item) => {
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild size="sm">
                      <Button type="button" onClick={() => item.callback()}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Button>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenuSub>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
