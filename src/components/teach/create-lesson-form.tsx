"use client";

import { useActionState } from "react";
import { createLessonAction, type CreateLessonState } from "@/app/actions/lessons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const SUBJECTS = ["Biology", "Chemistry", "Physics", "Algebra 1", "Geometry", "US History", "World History", "English", "Government"];

export function CreateLessonForm({ example = false }: { example?: boolean }) {
  const [state, action, pending] = useActionState<CreateLessonState, FormData>(createLessonAction, undefined);
  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="title">Lesson title</Label>
          <Input id="title" name="title" placeholder="Photosynthesis" defaultValue={example ? "Photosynthesis" : undefined} maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="subject">Subject</Label>
          <Input id="subject" name="subject" list="subjects" placeholder="Biology" defaultValue={example ? "Biology" : undefined} maxLength={60} />
          <datalist id="subjects">
            {SUBJECTS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="keyTerms">Key terms</Label>
        <Textarea
          id="keyTerms"
          name="keyTerms"
          rows={3}
          placeholder="Paste slide text or type words, separated by commas"
          defaultValue={example ? "photosynthesis, chlorophyll, chloroplast, glucose, carbon dioxide, Calvin cycle, ATP, cell membrane" : undefined}
          aria-describedby="keyTerms-help"
        />
        <p id="keyTerms-help" className="text-sm text-ink-2">
          Students see these words highlighted in their language, with a simple definition. Optional, but it helps a lot.
        </p>
      </div>
      {state?.error && (
        <p role="alert" className="rounded-lg bg-coral-soft px-3 py-2 text-sm">
          {state.error}
        </p>
      )}
      <Button type="submit" className="h-11 px-6 text-base" disabled={pending}>
        {pending ? "Starting..." : "Start lesson"}
      </Button>
    </form>
  );
}
