Keeper
======

About
-----

Keeper is a Django project and app that provides a form for submission of files to
the UNT Libraries Special Collections. It can be found at [https://www.library.unt.edu/special-collections/keeper](https://www.library.unt.edu/special-collections/keeper)

Requirements
------------

* [Podman](https://podman.io/) or [Docker](https://www.docker.com/)
  * This project was developed to run on rootless Podman. Docker may work as a dropin replacement, but it has not been tested.
* [Podman Compose](https://github.com/containers/podman-compose)

Optional:
* [Python 3.5+](https://www.python.org/downloads/)
* [Django 4](https://www.djangoproject.com/download/)
* [MySQL](https://www.mysql.com/) or other database for Django
* [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)


Installation for Development
----------------------------

1. Download this project from GitHub.

    ```sh
    git clone https://github.com/unt-libraries/keeper
    ```

2. Change the permissions on the `entrypoint.sh` file to allow it to be executed.

    ```bash
    chmod +x entrypoint.sh
    ```

3. Copy .env.template to .env and edit the values as needed.

    ```bash
    cp .env.template .env
    ```

4. Build the containers with Podman Compose.

    ```bash
    npm run build
    ```

5. Start the containers with Podman Compose.

    ```bash
    npm run start
    ```

6. In a separate terminal, run the Django migrations.

    ```bash
    npm run migrate
    ```

7. Generate a secret key and copy it to your `.env` file.

    ```bash
    python -c 'import random; print("".join([random.choice("abcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*(-_=+)") for i in range(50)]))'
    ```

8. Create a superuser for the Django admin site.

    ```bash
    npm run createsuperuser
    ```

9. The app can be accessed at `http://localhost:8000` and the admin site can be accessed
    at `http://localhost:8000/admin`.


Installation for Production
---------------------------

Building the project for production is similar to building for development, but there are a few key
differences and it will take consideration of your production environment.

Current Podman versions do not support env files named anything but `.env`, even if specified in
the compose file, so the values will need to be changed in your `.env` file. There are prod versions
of npm commands that will use the prod compose file and prod Django settings.

Because the version of Podman-compose available to our production servers does not support the
necessary networking options, we used a Makefile and the Podman pods system. That file can be reviewed
for the commands necessary to run the project in production.

Production requires the collection of static files, which is not necessary in development.

The location of `private-media` and `postgres_data` will need to be changed to match your production 
environment. For our production environment, they are at the same level as the project directory, not inside it.

Directory structure
-------------------

Some (not all) notable directories and files:

* `gulp/` - Gulp tasks and configuration for building frontend static files.
  * `config.js` - Configuration file for customizing gulp tasks.
* `keeper/` - Keeper app directory
  * `static/` - Static files JavaScript, CSS, and image files.
  * `templates/` - Admin and app templates.
  * `constants.py` - File types accepted by Dropzone.js and form validation
* `private-media/` - Directory where user files are uploaded. Only accessible to administrators.
* `src/` - Source files for static JavaScript and CSS.
* `tests/` - Django project directory.
  * `settings/` - Settings files for each environment, but most customization should be in secrets.json.

Configuration
-------------

The app allows uploading of the following file MIME types. Accepted MIME types can be edited in
`keeper/constants.py`.

```python
image/*
video/*
audio/*
application/msword
application/pdf
text/plain
text/html
```

[MIME types at MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types)

Maximum file size is currently set at 4000 MB. This (and other parameters) can be changed in the
Dropzone configuration object in `src/js/scripts.js`. The maximum file size is defined with
`maxFilesize` in the Dropzone object.

Building static files
---------------------

If you make any changes to the JS or CSS in `src/`, you'll need to rebuild the static files.

* `$ npm run install` in project root to install `node_modules` dependencies
* `$ gulp vendor-scripts` to copy vendor scripts from node_modules to static
* `$ npm run watchAssets` will generate CSS and JS and watch for changes
* `$ npm run buildCss` to generate CSS
* `$ gulp buildScripts` to generate JS
* `$ gulp vendor-scripts` to copy vendor scripts from npm to static

Gulp configuration can be changed in `gulp/config.js`.

Testing
-------

WIP: TESTING DOCUMENTATION IS OUT OF DATE SINCE CONTAINERIZATION

Tests are written with [pytest](https://docs.pytest.org/en/latest/),
[pytest-django](https://pytest-django.readthedocs.io/en/latest/), and [tox](https://tox.readthedocs.io/en/latest/).
You will need to install both the development requirements and test requirements to run tests.

```bash
(.venv) $ pip install -r requirements/dev.txt
(.venv) $ pip install -r requirements/test.txt
```

You will also need to ensure that your mysql user has the ability to create databases. This can be done with the
following command:

```mysql
mysql> GRANT CREATE ON *.* TO 'keeper_user'@'localhost';
```

To run the tests, use the `tox` command in the project root.

```bash
(.venv) $ tox
```

License
-------

See LICENSE.txt

Contributors
------------

* [Jason Ellis](https://github.com/jason-ellis)
