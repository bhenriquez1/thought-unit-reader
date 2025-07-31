const getChapterText = (index: number) => {
  // Handle possible undefined values explicitly
  const startPage = chapters[index]?.page;
  const start = startPage !== undefined ? startPage - 1 : 0;
  
  const nextChapter = chapters[index + 1];
  const endPage = nextChapter?.page;
  const end = endPage !== undefined ? endPage - 1 : parsedUnits.length;
  
  return parsedUnits.slice(start, end).flat().join(" ");
};