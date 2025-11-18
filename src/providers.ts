export const PROVIDER_CONFIG: Record<
  string,
  {
    tripupdates_url: string;
    alerts_url: string;
    headers: Record<string, string>;
  }
> = {
  bart: {
    tripupdates_url: "https://api.bart.gov/gtfsrt/tripupdate.aspx",
    alerts_url: "https://api.bart.gov/gtfsrt/alerts.aspx",
    headers: {},
  },
};
