/**
 * Returns a string that represents the order of a note
 * in the format of "sectionOrder-lectureOrder-timestampOrder"
 * where sectionOrder is the order of the section, lectureOrder is the order of the lecture,
 * and timestampOrder is the order of the timestamp based on the hour, minute and second.
 * @param {string} section - the section of the note
 * @param {string} lecture - the lecture of the note
 * @param {string} timestamp - the timestamp of the note in the format of "HH:MM:SS"
 * @returns {string} the order of the note
 */
export function orderInfo(
  section: string,
  lecture: string,
  timestamp: string,
): string {
  const sectionOrder = (parseInt(section) || 0).toString()
  const lectureOrder = (parseInt(lecture) || 0).toString()
  // matches timestamp in the format of "HH:MM:SS"
  // captures hour, minute and second in groups
  const timestampMatch = timestamp.match(
    /((?<hour>\d+):)?(?<minute>\d+):(?<second>\d+)/,
  )
  const timestampHour = parseInt(timestampMatch?.groups?.hour || '0')
  const timestampMinute = parseInt(timestampMatch?.groups?.minute || '0')
  const timestampSecond = parseInt(timestampMatch?.groups?.second || '0')
  const timestampOrder = (
    timestampHour * 3600 +
    timestampMinute * 60 +
    timestampSecond
  ).toString()
  return `${sectionOrder.padStart(3, '0')}-${lectureOrder.padStart(3, '0')}-${timestampOrder.padStart(5, '0')}`
}
