/** Static export: the build writes plain files to /out, which any free static host can serve. */
const nextConfig = { output: "export", trailingSlash: true, images: { unoptimized: true } };
export default nextConfig;
