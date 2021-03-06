[![Circle CI](https://circleci.com/gh/CodeNow/image-builder.svg?style=svg&circle-token=88ba2c8c095692ffd21461040e1ee822e7ee30ee)](https://circleci.com/gh/CodeNow/image-builder)

# Docker Image Builder

A Docker image that is used to build other Docker images using other resources.

## Building the Docker Image

To build the image, from the repository root:

```
docker build -t runnable/image-builder .
```

## Building an Image

This builds an image from the following resources:

- Dockerfile (stored on S3, versioned)
- Source directory (on S3, with versions)
- Repository:
  - From Github private repo - using a deploy key
  - From Github public repo - using https

Building an image with this image is a simple as using `docker run` and setting up environment variables in the command. An example script is included (`example.sh`), the contents of which are here (with some notes on each below):

```
docker run \
  -e RUNNABLE_AWS_ACCESS_KEY='AWS-ACCESS-KEY' \
  -e RUNNABLE_AWS_SECRET_KEY='AWS-SECRET-KEY'  \
  -e RUNNABLE_FILES_BUCKET='aws.bucket.name'  \
  -e RUNNABLE_PREFIX='source/' \
  -e RUNNABLE_FILES='{ "source/Dockerfile": "Po.EGeNr9HirlSJVMSxpf1gaWa5KruPa" }'  \
  -e RUNNABLE_KEYS_BUCKET='aws.keys.bucket.name'  \
  -e RUNNABLE_DEPLOYKEY='path/to/a/id_rsa'  \
  -e RUNNABLE_REPO='git@github.com:visionmedia/express'  \
  -e RUNNABLE_COMMITISH='master'  \
  -e RUNNABLE_DOCKER='tcp://192.168.59.103:2375' \
  -e RUNNABLE_DOCKERTAG='docker-tag' \
  -e RUNNABLE_DOCKER_BUILDOPTIONS='' \
  -v /host/path/to/cache:/cache:rw  \
  runnable/image-builder
```

- `RUNNABLE_AWS_ACCESS_KEY`: your AWS access key
- `RUNNABLE_AWS_SECRET_KEY`: your AWS secret access key
- `RUNNABLE_FILES_BUCKET`: bucket where the Dockerfile/source files are stored
- `RUNNABLE_PREFIX`: prefix of the source path of the files in S3
- `RUNNABLE_FILES`: a string representing a JSON object with S3 `Key`: `VersionId`. This MUST include a Dockerfile, and optionally can contain other files for the source directory
- `RUNNABLE_KEYS_BUCKET`: for a private repository, this is the bucket where deploy keys are stored
- `RUNNABLE_REPO`: repository to checkout using `git`. Must be in the SSH format, w/ no `.git` at the end
- `RUNNABLE_COMMITISH`: something to checkout in the repository
- `RUNNABLE_DOCKER`: Docker connection information, best formatted `tcp://ipaddress:port`
- `RUNNABLE_DOCKERTAG`: Tag for the built Docker image
- `RUNNABLE_DOCKER_BUILDOPTIONS`: other Docker build options
-  `-v /host/path/to/cache:/cache:rw`: cache for github repos

## Multiple Repositories

This supports checking out multiple repositories, with multiple commitishes, and deploy keys. Set the variable using `;` as the separator and it will download all of them.

The following variables support multiple values:

- `RUNNABLE_DEPLOYKEY`
- `RUNNABLE_REPO`
- `RUNNABLE_COMMITISH`

NOTE: `RUNNABLE_REPO` and `RUNNABLE_COMMITISH` need to be a one-to-one correspondence for it to work correctly (does NOT assume `master` or any other value).

### Development

This repo does not have enough tests to be reliably pull requested without manual testing.
{TODO: outline manually tests that should be verified before a pull request}

## Debugging the Builder

If you need to debug the builder, you can set the environment variables, then additionally set `--rm -ti` as `run` options, and put `bash` on the end of the command after `runnable/image-builder`. This will dump you into a shell where you can run `./dockerBuild.sh` to manually run the build!

## Testing

A few tests are now available to run:

- `npm run lint`: runs the javascript linter against the code
- `npm run test`: runs some unit tests against the various steps. **NOTE:** these tests should _not_ be run on your local, main, dev machine (yet). It tends to do destructive things to your ssh-agent (and some file system stuff), so don't quite trust it locally yet
- `./scripts/run-tests.sh`: runs some integration tests against a built docker image to make sure all the things run through correctly
