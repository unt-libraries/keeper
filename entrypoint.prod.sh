#!/bin/sh

if [ "$DATABASE" = "postgres" ]
then
    echo "Waiting for postgres..."

    while ! nc -z $DATABASES_HOST $DATABASES_PORT; do
      sleep 0.1
    done

    echo "PostgreSQL started"
fi

exec "$@"
