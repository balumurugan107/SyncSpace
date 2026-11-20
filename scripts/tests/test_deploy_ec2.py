"""Exercise rollout failure boundaries with fake Docker/AWS, never a real host."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


REPO = Path(__file__).resolve().parents[2]
IMAGE = '190706546302.dkr.ecr.ap-south-1.amazonaws.com/syncspace@sha256:'


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / 'host'
        self.bin = self.base / 'bin'
        self.bin.mkdir()
        self.log = self.base / 'commands.jsonl'
        self.release = self.base / 'release-1'
        self.release.mkdir()
        shutil.copy(REPO / 'scripts/deploy-ec2.sh', self.release / 'deploy-ec2.sh')
        shutil.copy(REPO / 'deploy/compose.ec2.yml', self.release / 'compose.ec2.yml')
        self.fake('aws', '#!/bin/sh\nprintf test-token\n')
        self.fake('curl', '#!/bin/sh\nexit 0\n')
        self.fake('docker', '''#!/usr/bin/env python3
import json, os, sys
args = sys.argv[1:]
with open(os.environ['TEST_COMMAND_LOG'], 'a') as file:
    file.write(json.dumps(args) + '\\n')
if args[0] == 'login':
    sys.stdin.read()
case = os.environ.get('TEST_FAILURE', '')
if case == 'pull' and 'pull' in args:
    sys.exit(11)
if case == 'migration' and 'run' in args:
    sys.exit(12)
if case == 'health' and 'up' in args and 'api' in args and any('.images.pending.' in arg for arg in args):
    sys.exit(13)
''')
        self.env = {**os.environ, 'PATH': str(self.bin) + ':' + os.environ['PATH'],
                    'SYNCSPACE_DEPLOY_ROOT': str(self.root), 'TEST_COMMAND_LOG': str(self.log)}

    def fake(self, name, content):
        path = self.bin / name
        path.write_text(content)
        path.chmod(0o755)

    def deploy(self, failure='', image=None):
        return subprocess.run(['bash', str(self.release / 'deploy-ec2.sh'),
                               image or IMAGE + 'a' * 64, IMAGE + 'b' * 64, 'http://3.109.56.36'],
                              env={**self.env, 'TEST_FAILURE': failure}, capture_output=True, text=True)

    def commands(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()]

    def test_success_preserves_secrets_and_records_release(self):
        self.assertEqual(self.deploy().returncode, 0)
        secrets = (self.root / '.env').read_bytes()
        self.assertEqual((self.root / '.env').stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.deploy(image=IMAGE + 'c' * 64).returncode, 0)
        self.assertEqual((self.root / '.env').read_bytes(), secrets)
        self.assertIn(IMAGE + 'c' * 64, (self.root / '.images.env').read_text())
        self.assertIn(IMAGE + 'a' * 64, (self.root / '.previous-images.env').read_text())
        self.assertEqual((self.root / '.current-release').read_text().strip(), str(self.release))

    def test_migration_failure_keeps_running_release(self):
        self.assertEqual(self.deploy().returncode, 0)
        previous = (self.root / '.images.env').read_bytes()
        self.log.write_text('')
        self.assertNotEqual(self.deploy('migration', IMAGE + 'c' * 64).returncode, 0)
        self.assertEqual((self.root / '.images.env').read_bytes(), previous)
        self.assertFalse(any('up' in args and 'api' in args for args in self.commands()))

    def test_failed_health_restores_previous_release_and_reports_failure(self):
        self.assertEqual(self.deploy().returncode, 0)
        previous = (self.root / '.images.env').read_bytes()
        self.log.write_text('')
        self.assertNotEqual(self.deploy('health', IMAGE + 'c' * 64).returncode, 0)
        self.assertEqual((self.root / '.images.env').read_bytes(), previous)
        rollbacks = [args for args in self.commands() if 'up' in args and 'api' in args
                     and str(self.root / '.images.env') in args]
        self.assertEqual(len(rollbacks), 1)

    def test_pull_failure_stops_before_database_or_service_changes(self):
        self.assertNotEqual(self.deploy('pull').returncode, 0)
        self.assertFalse(any('up' in args or 'run' in args for args in self.commands()))

    def test_rejects_images_outside_selected_repository(self):
        self.assertNotEqual(self.deploy(image='docker.io/example/api:latest').returncode, 0)
        self.assertFalse(self.log.exists())


if __name__ == '__main__':
    unittest.main()
