export interface MongoMemoryRuntime {
  memory: unknown;
  uri: string;
  dbName: string;
}

export interface Config {
  mongodb: MongoMemoryRuntime;
}
