-- CheckConstraint
-- Blocks an unbounded description (a nullable text column has no natural limit) that could be used
-- to abuse storage. NULL stays valid: description is optional. The 2000 matches
-- authConfig.projects.descriptionMaxLength and the Zod schema in src/lib/validation/projects.ts.
ALTER TABLE "projects" ADD CONSTRAINT "projects_description_length" CHECK (description IS NULL OR char_length(description) <= 2000);
