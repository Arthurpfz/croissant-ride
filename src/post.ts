// "Post to" services on the summary: each one downloads the .FIT and opens the site's own upload page (no APIs,
// no keys). Add a service = add a line. `caption`: also copy a ready description (Strava leaves it empty).
export interface PostService { name: string; url: string; hint: string; caption?: boolean }

export const services: PostService[] = [
  { name: 'Intervals.icu', url: 'https://intervals.icu/activities', hint: 'Use the ↑ upload icon and drop the file in.' },
  { name: 'Strava', url: 'https://www.strava.com/upload/select', hint: 'Drop the file in, then paste the copied caption into Description.', caption: true },
  { name: 'Garmin', url: 'https://connect.garmin.com/app/import-data', hint: 'Drop the file in.' },
  { name: 'TrainingPeaks', url: 'https://app.trainingpeaks.com/#calendar', hint: 'Drag the file onto today in the calendar.' },
];
