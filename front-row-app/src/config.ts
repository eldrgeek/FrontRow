
interface Config {
  artistName: string;
}

const config: Config = {
  artistName: "The Virtual Troubadour",
  // In Rev 1, artistImage is not dynamically used here as it's for user profiles.
  // This config is mostly for the static stage setup.
};

export default config;
