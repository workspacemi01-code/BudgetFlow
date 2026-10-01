"use client"

import { useActionState, useState } from "react"
import { Plus } from "lucide-react"

import { addBudgetLine, addDepartment } from "@/app/actions/budget"
import { Field, controlClass } from "@/components/field"
import { FormMessage, SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { FormState } from "@/lib/types"

const initial: FormState = {}

/** Wraps a server action so a successful submit closes the dialog. */
function useDialogAction(action: (state: FormState, formData: FormData) => Promise<FormState>, onDone: () => void) {
  return useActionState(async (state: FormState, formData: FormData) => {
    const result = await action(state, formData)
    if (!result.error) onDone()
    return result
  }, initial)
}

function AddDepartmentForm({ currency, onDone }: { currency: string; onDone: () => void }) {
  const [state, action] = useDialogAction(addDepartment, onDone)
  return (
    <form action={action} className="grid gap-4">
      <Field label="Department name" htmlFor="dept-name">
        <Input id="dept-name" name="name" required className="h-11" placeholder="e.g. Marketing" />
      </Field>
      <Field label="Short code" htmlFor="dept-code" hint="Optional. Defaults to the first three letters.">
        <Input id="dept-code" name="code" maxLength={20} className="h-11 uppercase" placeholder="MKT" />
      </Field>
      <Field label={`Annual budget (${currency})`} htmlFor="dept-budget" hint="You can set or change this later.">
        <Input id="dept-budget" name="budget" type="number" min={0} step="0.01" inputMode="decimal" className="h-11" />
      </Field>
      <FormMessage error={state.error} />
      <SubmitButton pendingLabel="Adding…">Add department</SubmitButton>
    </form>
  )
}

export function AddDepartmentDialog({ currency }: { currency: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button className="h-10 px-4" onClick={() => setOpen(true)}>
        <Plus />
        Add department
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add department</DialogTitle>
            <DialogDescription>Departments hold the annual budget that budget lines are split from.</DialogDescription>
          </DialogHeader>
          {open && <AddDepartmentForm currency={currency} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

interface LineDialogProps {
  currency: string
  departments: { id: string; name: string }[]
  /** Brands with the department they belong to, so the list can narrow. */
  brands: { id: string; name: string; departmentId: string }[]
  /** Units with their brand, likewise. */
  units: { id: string; name: string; brandId: string }[]
  brandLabel: string
  categories: string[]
  canAddCategory: boolean
}

function AddLineForm({
  currency,
  departments,
  brands,
  units,
  brandLabel,
  categories,
  canAddCategory,
  onDone,
}: LineDialogProps & { onDone: () => void }) {
  const [state, action] = useDialogAction(addBudgetLine, onDone)
  const [departmentId, setDepartmentId] = useState(departments.length === 1 ? departments[0].id : "")
  /* Typed, not selected: the same control offers what exists and accepts
     something new, so setting up Fearless or Sosa is just typing it once. */
  const [brand, setBrand] = useState("")

  const brandsHere = brands.filter((b) => b.departmentId === departmentId)
  const chosenBrand = brandsHere.find((b) => b.name.toLowerCase() === brand.trim().toLowerCase())
  const unitsHere = chosenBrand ? units.filter((u) => u.brandId === chosenBrand.id) : []

  return (
    <form action={action} className="grid gap-4">
      <Field label="Department" htmlFor="line-dept">
        <select
          id="line-dept"
          name="departmentId"
          required
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          className={controlClass}
        >
          <option value="">Choose a department</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>
      {/* Department › Brand › Unit, in that order, because that is the order
          the business thinks in. Both are optional: a cost the department
          carries as a whole needs neither, and a cost one unit carries needs
          both. */}
      <Field
        label={brandLabel}
        htmlFor="line-brand"
        hint={departmentId ? "Optional. Leave empty for a department-wide line." : "Choose a department first."}
      >
        <Input
          id="line-brand"
          name="brand"
          list="line-brands"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          disabled={!departmentId}
          className="h-11"
          autoComplete="off"
          placeholder="e.g. Fearless Brand"
        />
        <datalist id="line-brands">
          {brandsHere.map((b) => (
            <option key={b.id} value={b.name} />
          ))}
        </datalist>
      </Field>
      <Field
        label="Unit"
        htmlFor="line-unit"
        hint={
          chosenBrand
            ? "Optional. A line here belongs to this unit alone."
            : `Choose a ${brandLabel.toLowerCase()} first.`
        }
      >
        <Input
          id="line-unit"
          name="unit"
          list="line-units"
          disabled={!brand.trim()}
          className="h-11"
          autoComplete="off"
          placeholder="e.g. Events"
        />
        <datalist id="line-units">
          {unitsHere.map((u) => (
            <option key={u.id} value={u.name} />
          ))}
        </datalist>
      </Field>
      <Field
        label="Category"
        htmlFor="line-category"
        hint={canAddCategory ? "Pick an existing category or type a new one." : "Ask Finance if the category you need is missing."}
      >
        {canAddCategory ? (
          <>
            <Input
              id="line-category"
              name="category"
              list="line-categories"
              required
              className="h-11"
              autoComplete="off"
              placeholder="e.g. Advertising"
            />
            <datalist id="line-categories">
              {categories.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </>
        ) : (
          <select id="line-category" name="category" required defaultValue="" className={controlClass}>
            <option value="">Choose a category</option>
            {categories.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={`Annual budget (${currency})`} htmlFor="line-budget">
        <Input
          id="line-budget"
          name="budget"
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          required
          className="h-11"
        />
      </Field>
      <FormMessage error={state.error} />
      <SubmitButton pendingLabel="Adding…">Add budget line</SubmitButton>
    </form>
  )
}

export function AddLineDialog(props: LineDialogProps) {
  const [open, setOpen] = useState(false)
  if (props.departments.length === 0) return null
  return (
    <>
      <Button className="h-10 px-4" onClick={() => setOpen(true)}>
        <Plus />
        Add budget line
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add budget line</DialogTitle>
            <DialogDescription>A line is the bucket spend is raised against.</DialogDescription>
          </DialogHeader>
          {open && <AddLineForm {...props} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
