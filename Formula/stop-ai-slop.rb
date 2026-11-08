class StopAiSlop < Formula
  desc "Zero-dependency linter that blocks AI-generated comment slop"
  homepage "https://github.com/WhiteBite/stop-ai-slop"
  url "https://registry.npmjs.org/stop-ai-slop/-/stop-ai-slop-2.1.2.tgz"
  sha256 "05d8f280d1a3bf9bc6b123c5fbcd5df9d2b5c006674833632425231324be6d57"
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
