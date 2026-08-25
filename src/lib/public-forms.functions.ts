import { createServerFn } from "@tanstack/react-start";
import {
  submitByFormSchema,
  submitPublicFormPayload,
  submitSchema,
} from "./public-forms.server";

export const submitPublicForm = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => submitSchema.parse(d))
  .handler(async ({ data }) => {
    return submitPublicFormPayload({ ...data, eventSlug: data.slug });
  });

export const submitPublicFormBySlug = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => submitByFormSchema.parse(d))
  .handler(async ({ data }) => {
    return submitPublicFormPayload(data);
  });
