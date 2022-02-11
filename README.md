Keeper
======

About
-----

Keeper is a Django project and app that provides a form for submission of files to
the UNT Libraries Special Collections. It can be found at [https://www.library.unt.edu/special-collections/keeper](https://www.library.unt.edu/special-collections/keeper)


Requirements
------------

* [Python 3.5+](https://www.python.org/downloads/)
* [Django 1.8](https://www.djangoproject.com/download/)
* [MySQL](https://www.mysql.com/) or other database for Django
* [Yarn](https://yarnpkg.com/en/) or [npm](https://www.npmjs.com/)


Installation
------------

It is recommended that you create a Python virtual environment (`venv`) for this project. Doing so will allow you to install
the requirements locally for the project instead of installing to your system-wide Python environment. These
instructions assume you're using Linux. If you are not, or want more information on Python virtual environments,
you may find it [here](https://docs.python.org/3.8/library/venv.html).

1. Install this project from GitHub.
    ```sh
    $ pip install git+git://github.com/unt-libraries/keeper.git
    ```

2. Create a venv for this project by issuing the following command in the project root:

    ```sh
    $ python -m venv .venv
    ```
It may be necessary for you to use `python3` instead of `python`. This creates a virtual environment in the `.venv`
directory in the project root. You may create your virtual environment in a different directory if you'd like, but this
location is already ignored by git.

3. Activate your virtual environment with:

    ```sh
    $ source .venv/bin/activate
    ```

Your command prompt should now be prepended by `(.venv)`, indicating that you are working on the virtual environment.
You should issue this command any time you begin working on the project.

You may deactivate the virtual environment with the `deactivate` command.

4. Install the development environment requirements.
    ```bash
    (.venv) $ pip install -r requirements/dev.txt
    ```
   
Depending your installation, you may need to use the `pip3` command instead.

If you receive MySQL-related errors, you may need to install libmysqlclient-dev separately 
from your package manager.

If you get an error that `bdist_wheel` is not installed, run `pip install wheel` and then run the requirements
installation command again.

5. Generate a secret key and copy it to your `secrets.json` file.
    ```bash
    $ python -c 'import random; print("".join([random.choice("abcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*(-_=+)") for i in range(50)]))'
    ```

6. Create a MySQL user and add credentials to `secrets.json`. Depending on your OS, MySQL may be started
with `sudo /etc/init.d/mysql start`.
    ```bash
    $ mysql -u root -p
    ```
    ```mysql
    mysql> CREATE USER 'newuser'@'localhost' IDENTIFIED BY 'password';
    ```

7. Create a new database in MySQL, grant privileges, and add the name to secrets.json
    ```bash
    $ mysql -u root -p
    ```
    ```mysql
    mysql> CREATE DATABASE keeper;
    Query OK, 1 row affected (0.00 sec)
    mysql> GRANT ALL PRIVILEGES ON keeper.* to 'keeper'@'localhost';
    Query OK, 0 rows affected (0.02 sec)
    ```

8. Run the migrate command with the settings argument. In this case, we're using dev settings.
    ```bash
    $ python manage.py migrate --settings=tests.settings.dev
    ```

9. Create a superuser for the Django admin site.
    ```bash
    $ python manage.py createsuperuser --settings=tests.settings.dev
    ```

10. Launch the Django development server.
    ```bash
    $ python manage.py runserver --settings=tests.settings.dev
    ```

    The app can be accessed at `http://localhost:8000` and the admin site can be accessed
    at `http://localhost:8000/admin`.


Directory structure
-------------------

Some (not all) notable directories and files:

- `gulp/` - Gulp tasks and configuration for building frontend static files.
  - `config.js` - Configuration file for customizing gulp tasks.
- `keeper/` - Keeper app directory
  - `static/` - Static files JavaScript, CSS, and image files.
  - `templates/` - Admin and app templates.
  - `constants.py` - File types accepted by Dropzone.js and form validation
- `private-media/` - Directory where user files are uploaded. Only accessible to administrators.
- `src/` - Source files for static JavaScript and CSS.
- `tests/` - Django project directory.
  - `settings/` - Settings files for each environment, but most customization should be in secrets.json.
- `secrets.json.template` - Use this to create `secrets.json` (see below) in the same directory.


Configuration
-------------

Copy the contents of `secrets.json.template` to a new file named `secrets.json`
- `FILENAME`: "secrets.json"
- `SECRET_KEY`: Created by Django
- `DATABASES_NAME`: Database name
- `DATABASES_USER`: Database user
- `DATABASES_PASSWORD`: Database password
- `DATABASES_HOST`: "localhost" or database IP
- `DATABASES_PORT`: Database port
- `RECAPTCHA_PUBLIC_KEY`: Provided by [Google reCAPTCHA](https://www.google.com/recaptcha/admin)
- `RECAPTCHA_PRIVATE_KEY`: Provided by [Google reCAPTCHA](https://www.google.com/recaptcha/admin)
- `ALLOWED_HOSTS`: Allowed hosts for Django

The app allows uploading of the following file MIME types. Accepted MIME types can be edited in 
`keeper/constants.py`.

```
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

This project uses Yarn, but you can use NPM if you'd like.

- `$ yarn` in project root to install `node_modules` dependencies
- `$ gulp vendor-scripts` to copy vendor scripts from node_modules to static
- `$ gulp` will generate CSS and JS and watch for changes
- `$ gulp sass` to generate CSS
- `$ gulp sass:watch` to watch for CSS changes
- `$ gulp  scripts` to generate JS
- `$ gulp scripts:watch` to watch for changes

Gulp configuration can be changed in `gulp/config.js`.


License
-------

See LICENSE.txt


Contributors
------------

* [Jason Ellis](https://github.com/jason-ellis)
