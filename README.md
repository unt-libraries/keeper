Keeper
======

About
-----

Keeper is a Django project and app that provides a form for submission of files to
the UNT Libraries Special Collections. It can be found at [https://www.library.unt.edu/special-collections/keeper](https://www.library.unt.edu/special-collections/keeper)


Requirements
------------

* [Python 2.7+](https://www.python.org/downloads/) (not Python 3)
* [Django 1.8](https://www.djangoproject.com/download/)
* [MySQL](https://www.mysql.com/) or other database for Django
* [Yarn](https://yarnpkg.com/en/) or [npm](https://www.npmjs.com/)


Installation
------------

While not required, we recommend using 
[virtualenv](http://docs.python-guide.org/en/latest/dev/virtualenvs/)
and [virtualenvwrapper](https://virtualenvwrapper.readthedocs.io/en/latest/) to manage your
Python environment.

1. Install this project from GitHub.
    ```sh
        $ pip install git+git://github.com/unt-libraries/keeper.git
    ```
    
2. Install virtualenv.
    ```sh
        $ pip install virtualenv
    ```

3. Install virtualenvwrapper.
    ```sh
        $ pip install virtualenvwrapper
        ...
        $ export WORKON_HOME=~/Envs
        $ mkdir -p $WORKON_HOME
        $ source /usr/local/bin/virtualenvwrapper.sh
    ```

4. Create a virtual environment.

    Check your system Python version with `python --version`.

    If your Python version is 2.7+, create a virtual environment with:
    ```sh
        $ mkvirtualenv keeper
    ```

    If your Python version is < 2.7, you may want to upgrade to 2.7 before continuing.
    
    If your Python version is 3.x, you should find where Python 2.7 is installed or install it 
    separately. Once installed, you can specify the Python bin for you virtual environment with:
    ```sh
        # Assuming Python 2.7 is installed at /usr/bin/python2.7
        $ mkvirtualenv -p /usr/bin/python2.7 keeper 
    ```

    You should now see `(keeper)` before your shell prompt, indicating you are working in the `keeper`
    virtualenv. Use `workon keeper` to start working in the environment and `deactivate` to exit the
    environment.

5. Install the development environment requirements.
    ```sh
        $ pip install -r requirements/dev.txt
    ```

    If you receive MySQL-related errors, you may need to install libmysqlclient-dev separately 
    from your package manager.

6. Generate a secret key and copy it to your `secrets.json` file.
    ``` sh
        $ python -c 'import random; print "".join([random.choice("abcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*(-_=+)") for i in range(50)])'
    ```

7. Create a MySQL user and add credentials to `secrets.json`.

8. Create a new database in MySQL and add the name to secrets.json
    ```sh
        $ mysql -u root -p
        
        mysql> CREATE DATABASE keeper;
        Query OK, 1 row affected (0.00 sec)
    ```

9. Run the migrate command with the settings argument. In this case, we're using dev settings.
    ```sh
        $ python manage.py migrate --settings=tests.settings.dev
    ```

10. Create a superuser for the Django admin site.
    ```sh
        $ python manage.py createsuperuser --settings=tests.settings.dev
    ```

11. Launch the Django development server.
    ```sh
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
- `media/` - Directory where user files are uploaded
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
