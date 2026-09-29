#!/usr/bin/env python3
"""Stable import entrypoint for AxionWBF fingerprint trainer v3.

Run the trainer by importing its module instead of executing that module as __main__.
This keeps custom sklearn transformer classes serialized under the stable
`train_wbf_fingerprint_model_v3` module path so joblib artifacts can be loaded by
separate inference/reference-building processes.
"""
from train_wbf_fingerprint_model_v3 import main


if __name__ == "__main__":
    main()
