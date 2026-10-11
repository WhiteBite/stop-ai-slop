class StopAiSlop < Formula
  desc "Zero-dependency linter that blocks AI-generated comment slop"
  homepage "https://github.com/WhiteBite/stop-ai-slop"
  url "https://registry.npmjs.org/stop-ai-slop/-/stop-ai-slop-2.0.0.tgz"
  sha256 "06a50cb08eb7dd8fb0144396e9e1e0b01cfdee28697814ed243fffa1d5c606bd"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match version.to_s, (libexec/"lib/node_modules/stop-ai-slop/package.json").read
    assert_match "slop-gate", shell_output("#{bin}/stop-ai-slop --help")
  end
end
