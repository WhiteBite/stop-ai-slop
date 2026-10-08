class StopAiSlop < Formula
  desc "Zero-dependency linter that blocks AI-generated comment slop"
  homepage "https://github.com/WhiteBite/stop-ai-slop"
  url "https://registry.npmjs.org/stop-ai-slop/-/stop-ai-slop-0.14.1.tgz"
  sha256 "2c1843b124a493ddf75b9adb50a8c18a101491ecceb308dc3e8e5e59a9633bfe"
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
