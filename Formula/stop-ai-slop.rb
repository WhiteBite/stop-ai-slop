class StopAiSlop < Formula
  desc "Zero-dependency linter that blocks AI-generated comment slop"
  homepage "https://github.com/WhiteBite/stop-ai-slop"
  url "https://registry.npmjs.org/stop-ai-slop/-/stop-ai-slop-2.1.0.tgz"
  sha256 "b63c5329f55b5b782661024f2ed1d8ded90459ce217411545a26d28b03a6a065"
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
