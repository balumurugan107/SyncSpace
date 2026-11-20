"""Send a verified release to the selected EC2 host without transmitting secrets."""
import base64
import io
import json
import os
import re
import shlex
import subprocess
import tarfile
import time


def aws(*args):
    result = subprocess.run(['aws', *args, '--output', 'json'], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return json.loads(result.stdout)


def main():
    sha = os.environ['SOURCE_SHA']
    suffix = os.environ['IMAGE_TAG_SUFFIX']
    assert re.fullmatch(r'[0-9a-f]{40}', sha)
    assert re.fullmatch(r'sha-[0-9a-f]{40}-[0-9]+-[0-9]+', suffix)
    instance = os.environ['INSTANCE_ID']
    assert instance == 'i-07ba7b7856115e939'
    origin = os.environ['PUBLIC_ORIGIN']
    assert re.fullmatch(r'https?://[a-zA-Z0-9.-]+(:[0-9]+)?', origin)
    repository = '190706546302.dkr.ecr.ap-south-1.amazonaws.com/syncspace'
    images = []
    for component in ('api', 'web'):
        detail = aws('ecr', 'describe-images', '--repository-name', 'syncspace',
                     '--image-ids', f'imageTag={component}-{suffix}')['imageDetails'][0]
        digest = detail['imageDigest']
        assert re.fullmatch(r'sha256:[0-9a-f]{64}', digest)
        images.append(f'{repository}@{digest}')

    payload = io.BytesIO()
    with tarfile.open(fileobj=payload, mode='w:gz') as archive:
        archive.add('deploy/compose.ec2.yml', arcname='compose.ec2.yml')
        archive.add('scripts/deploy-ec2.sh', arcname='deploy-ec2.sh')
    encoded = base64.b64encode(payload.getvalue()).decode('ascii')
    destination = f'/opt/syncspace/releases/{sha}'
    commands = [
        'set -eu', 'umask 077',
        f'mkdir -p {shlex.quote(destination)}',
        f'printf %s {shlex.quote(encoded)} | base64 -d | tar -xz -C {shlex.quote(destination)}',
        shlex.join(['bash', f'{destination}/deploy-ec2.sh', *images, origin]),
    ]
    response = aws('ssm', 'send-command', '--instance-ids', instance,
                   '--document-name', 'AWS-RunShellScript',
                   '--comment', f'SyncSpace deploy {sha}',
                   '--parameters', json.dumps({'commands': commands, 'executionTimeout': ['900']}))
    command_id = response['Command']['CommandId']
    print(f'SSM deployment command: {command_id}', flush=True)
    result = None
    for _ in range(96):
        try:
            result = aws('ssm', 'get-command-invocation', '--command-id', command_id, '--instance-id', instance)
        except RuntimeError as error:
            if 'InvocationDoesNotExist' not in str(error):
                raise
            time.sleep(10)
            continue
        if result['Status'] in ('Pending', 'InProgress', 'Delayed'):
            time.sleep(10)
            continue
        print(result.get('StandardOutputContent', ''))
        print(result.get('StandardErrorContent', ''))
        if result['Status'] != 'Success':
            raise RuntimeError(f"Deployment ended with {result['Status']}; inspect SSM command {command_id}")
        summary = f'## EC2 deployment\n\nHost: {origin}\n\nCommit: `{sha}`\n\n'
        summary += '\n'.join(f'- `{image}`' for image in images) + '\n'
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as file:
            file.write(summary)
        return
    raise RuntimeError(f'Deployment polling timed out; inspect SSM command {command_id} before retrying')


if __name__ == '__main__':
    main()
