'use client'

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '#/components/ui/sidebar'
import { LucideIcon, ShieldUser } from 'lucide-react'
import { Button } from './ui/button'
import { SidebarMenuSub } from './ui/sidebar-ori'

export interface NavAdminProps {
  items: {
    title: string
    callback: Function
    icon: LucideIcon
  }[]
}

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
