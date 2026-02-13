// lib/syllabusParser/index.ts
// Syllabus Intelligence Module Exports

export {
  parseSyllabus,
  type SyllabusBlock,
  type SyllabusBlockType,
  type ParsedSyllabus,
  type Reading,
  type DateRange,
} from './parser';

export {
  generateCoursePlan,
  searchTocForTopic,
  getReadingSuggestions,
  type CoursePlan,
  type BlockMapping,
  type MatchedReading,
  type TocMatch,
  type StudyDay,
} from './coursePlanner';
