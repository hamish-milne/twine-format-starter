declare module "posthtml" {
  export default function (plugins: unknown[]): {
    process(input: string): Promise<{ html: string }>;
  };
}
declare module "posthtml-inline-assets" {
  export default function (options: any): unknown;
}
declare module "htmlnano" {
  export default function (options: any): unknown;
}
