export type Project = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
};

export type CreateProjectRequest = {
  name: string;
};
