#! /usr/bin/env python
from setuptools import setup, find_packages

install_requires = [
    'django-parsley==0.6',
    'django-recaptcha==1.0.4',
    'mysqlclient==1.3.7',
    'python-magic==0.4.10',
    'Unipath==1.1',
    'wheel==0.38.1',
    'zipstream==1.1.3',
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