export type ClusterSchool = {
  name: string;
  abbrev: string;
  state?: string;
  slug: string;
  unitid: number;
  slugAbbrev?: string;
};

export type ClusterOmit = {
  a: string;
  b: string;
  reason: string;
};

export type ClusterFile = {
  id: string;
  title: string;
  status?: "active" | "complete";
  schools: ClusterSchool[];
  omits?: ClusterOmit[];
};

const clusterModules = import.meta.glob<{ default: ClusterFile }>(
  "../data/clusters/*.json",
  { eager: true },
);

function fileBase(path: string): string {
  return (path.split("/").pop() ?? "").replace(/\.json$/, "");
}

const SKIP = new Set(["queue", "grow-state"]);

const clusters: ClusterFile[] = Object.entries(clusterModules)
  .filter(([path]) => !SKIP.has(fileBase(path)))
  .map(([, mod]) => mod.default)
  .filter((c) => c?.id && Array.isArray(c.schools));

export function allClusters(): ClusterFile[] {
  return clusters;
}

export function clusterForSlug(slug: string): ClusterFile | undefined {
  return clusters.find((c) => c.schools.some((s) => s.slug === slug));
}

export function clusterSchool(
  cluster: ClusterFile,
  slug: string,
): ClusterSchool | undefined {
  return cluster.schools.find((s) => s.slug === slug);
}

export function isOmittedPair(
  cluster: ClusterFile,
  slugA: string,
  slugB: string,
): boolean {
  return (cluster.omits ?? []).some(
    (o) =>
      (o.a === slugA && o.b === slugB) || (o.a === slugB && o.b === slugA),
  );
}
