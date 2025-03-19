#! /usr/bin/env python
from setuptools import setup, find_packages

install_requires = [
    'django-parsley',
    'django-recaptcha',
    'psycopg2',
    'python-magic',
    'Unipath',
    'wheel==0.41.0',
    'zipstream',
]

setup(
    name='keeper',
    version='1.0.0',
    packages=find_packages(exclude=['tests']),
    description='',
    long_description='',
    include_package_data=True,
    install_requires=install_requires,
    url='https://github.com/unt-libraries/keeper/',
    license='BSD',
    classifiers=[
        'Natural Language :: English',
        'Environment :: Web Environment',
        'Framework :: Django :: 1.8',
        'Programming Language :: Python',
        'Programming Language :: Python :: 2',
        'Programming Language :: Python :: 2.7',
    ]
)
