"use client"

import Link from "next/link"
import { startTransition } from "react"
import { CalendarPlus, ListTree, LogOut } from "lucide-react"

import { signOut } from "@/app/actions/auth"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?"

/**
 * The avatar in the header, and what is behind it.
 *
 * The trigger takes a className and its own children rather than
 * `render={<Button/>}`. Base UI's render prop expects an element that forwards
 * everything it is handed, and the Button here does not — the result was error
 * #31 thrown on click, which escaped to the global boundary, so tapping your
 * own initial replaced the entire app with "Something went wrong".
 *
 * The rest of the shell uses this same plain-trigger form, and it has always
 * worked. That was the tell.
 */
export function UserMenu({ name, email }: { name: string; email: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account"
        className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary outline-none hover:bg-primary/15 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {initials(name)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* Label and items must sit inside a Group. Base UI's label reads a
            context the group provides, and without it the whole menu threw on
            open — which the global boundary caught, so tapping your own
            initial replaced the app with "Something went wrong". */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="truncate text-sm font-medium">{name}</div>
            <div className="truncate text-xs text-muted-foreground">{email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {/* Somewhere to go, not only a way out. The tab bar covers the
              current budget; these are the two things outside it. */}
          <DropdownMenuItem render={<Link href="/personal" />}>
            <ListTree />
            My budget
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/personal/new" />}>
            <CalendarPlus />
            Start another budget
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => startTransition(() => signOut())}>
            <LogOut />
            Log out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
