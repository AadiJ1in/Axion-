const includesFacet = (value, expected) => String(value || "").split("|").includes(expected);

export function matchesPrescriptionFilters(exercise, filters) {
  const {
    query = "",
    program = "All",
    goal = "All",
    equipment = "All",
    position = "All",
    tracking = "All",
    analysis = "All",
    commonOnly = false,
    selectedOnly = false,
    allowedCategories = null,
  } = filters;
  const queryMatch = !query || String(exercise.search || "").includes(query);
  const programMatch = program === "All" || includesFacet(exercise.programs, program);
  const goalMatch = goal === "All" || includesFacet(exercise.goals, goal);
  const equipmentMatch = equipment === "All" || includesFacet(exercise.equipment, equipment);
  const positionMatch = position === "All" || exercise.position === position;
  const trackingMatch = tracking === "All" || exercise.tracking === tracking;
  const analysisMatch = analysis === "All"
    || (analysis === "camera" && exercise.tracking === "pose_reps")
    || (analysis === "game" && exercise.game);
  const commonMatch = !commonOnly || exercise.common;
  const areaMatch = !allowedCategories || allowedCategories.includes(exercise.category);
  const selectedMatch = !selectedOnly || exercise.selected;
  return queryMatch && programMatch && goalMatch && equipmentMatch && positionMatch
    && trackingMatch && analysisMatch && commonMatch && areaMatch && selectedMatch;
}
