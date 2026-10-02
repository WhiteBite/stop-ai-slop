class StopAiSlop < Formula
  desc "Zero-dependency linter that blocks AI-generated comment slop"
  homepage "https://github.com/WhiteBite/stop-ai-slop"
  url "https://registry.npmjs.org/stop-ai-slop/-/stop-ai-slop-0.12.0.tgz"
  sha256 "58b99d1288ecb102f50fbe04c9726b3ac58a028c62fd7362c2e1933bae82f0c7"
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
