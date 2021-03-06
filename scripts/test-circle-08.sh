#!/usr/bin/env bash
# first layer cache + github cache test
# little more involved, so some echos to let you know where things fail
set -e

test_num="08"
full_repo="bkendall/flaming-octo-nemesis"

# make sure there's nothing in this layer cache
if [[ -d ./test-"$test_num" ]]; then
  rm -rf ./test-"$test_num"
fi
mkdir -p ./test-"$test_num"/"$full_repo"
mkdir -p ./test-"$test_num"/layer-cache

docker run \
  -e RUNNABLE_AWS_ACCESS_KEY="$AWS_ACCESS_KEY" \
  -e RUNNABLE_AWS_SECRET_KEY="$AWS_SECRET_KEY" \
  -e RUNNABLE_FILES_BUCKET='runnable.image-builder' \
  -e RUNNABLE_PREFIX='' \
  -e RUNNABLE_FILES='{ "Dockerfile": "N8n2m1Ix7K41qRM8IVnghDwulfTB4X2S" }' \
  -e RUNNABLE_KEYS_BUCKET='runnable.image-builder' \
  -e RUNNABLE_DEPLOYKEY='flaming-octo-nemesis.key' \
  -e RUNNABLE_REPO='git@github.com:bkendall/flaming-octo-nemesis' \
  -e RUNNABLE_COMMITISH='master' \
  -e RUNNABLE_DOCKER="tcp://$(cat DOCKER_IP):5354" \
  -e RUNNABLE_DOCKERTAG='test/test-built-image:sometag' \
  -e RUNNABLE_DOCKER_BUILDOPTIONS='' \
  -e RUNNABLE_IMAGE_BUILDER_NAME='test-image-builder' \
  -e RUNNABLE_IMAGE_BUILDER_TAG='latest' \
  -e DOCKER_IMAGE_BUILDER_LAYER_CACHE="`pwd`/test-$test_num/layer-cache" \
  -v `pwd`/test-"$test_num":/cache:rw \
  -v `pwd`/test-"$test_num"/layer-cache:/layer-cache \
  test-image-builder

echo "checking repo status"
# it should not be locked
test ! -d ./test-"$test_num"/"$full_repo".lock || (echo "lock should not exist" && false)
# the repo should exist
test -e ./test-"$test_num"/"$full_repo" || (echo "repo should exist" && false)
# and the repo should exist
test -f ./test-"$test_num"/"$full_repo"/README.md || (echo "repo should be cloned" && false)

echo "looking for archiver and waiting"
# the archiver should be running
running_containers=$(docker ps --no-trunc | grep "dockerLayerArchive" | wc -l)
test $running_containers = "1" || (echo "container should be running dockerLayerArchive" && false)
# wait for the container, and it should be successfull
docker wait $(docker ps  --no-trunc | grep "dockerLayerArchive" | awk '{print $1}')

echo "checking layer cache status"
# layer-cache tests
# directory and layer should exist
test -d ./test-"$test_num"/layer-cache/test/test-built-image || (echo "directory for layer should exist" && false)
ls ./test-"$test_num"/layer-cache/test/test-built-image/*.tar 1> /dev/null 2>&1 || (echo "layer.tar should exist" && false)
