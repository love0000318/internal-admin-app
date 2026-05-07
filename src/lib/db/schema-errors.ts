const SCHEMA_ERROR_MARKERS = [
  "P2021",
  "P2022",
  "does not exist",
  "doesn't exist",
  "table",
  "relation",
  "column",
  "enum",
  "not found in the database",
];

export function isPrismaSchemaPreparationError(
  error: unknown,
  extraMarkers: string[] = [],
) {
  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === "string"
        ? error
        : stringifyUnknownError(error);

  return [...SCHEMA_ERROR_MARKERS, ...extraMarkers].some((marker) =>
    message.toLowerCase().includes(marker.toLowerCase()),
  );
}

function stringifyUnknownError(error: unknown) {
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
