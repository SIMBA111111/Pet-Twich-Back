export function timeToSeconds(timeStr) {
  // Разбиваем строку на компоненты
  const parts = timeStr.split(':');
  
  if (parts.length === 3) {
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseFloat(parts[2]); // С учетом миллисекунд
    
    return hours * 3600 + minutes * 60 + seconds;
  }
  
  return 0;
}