declare module 'murmurhash3js-revisited' {
  interface MurmurHash3 {
    x86: {
      hash32(data: string | Buffer, seed?: number): number;
      hash128(data: string | Buffer, seed?: number): string;
    };
    x64: {
      hash128(data: string | Buffer, seed?: number): string;
    };
  }

  const murmurhash3: MurmurHash3;
  export default murmurhash3;
}

